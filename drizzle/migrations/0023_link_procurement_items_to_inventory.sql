ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS inventory_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_items_inventory_product ON public.procurement_items(inventory_product_id);
COMMENT ON COLUMN public.procurement_items.inventory_product_id IS 'Inventory product (products.id) this purchasing catalog item stocks into';

ALTER TABLE public.purchase_invoice_items ADD COLUMN IF NOT EXISTS procurement_order_item_id uuid REFERENCES public.procurement_order_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pii_procurement_order_item ON public.purchase_invoice_items(procurement_order_item_id);

-- backfill: link only exact, unambiguous name matches within the same owner
UPDATE public.procurement_items pi SET inventory_product_id = p.id
FROM public.products p
WHERE pi.inventory_product_id IS NULL AND p.user_id = pi.user_id AND p.name = pi.name
  AND (SELECT count(*) FROM public.products p2 WHERE p2.user_id = pi.user_id AND p2.name = pi.name) = 1;

-- Resolve (or create once) the inventory product for a purchasing catalog item
CREATE OR REPLACE FUNCTION public.ensure_procurement_item_product(p_item_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it record; v_pid uuid; v_cnt int;
BEGIN
  IF p_item_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO it FROM public.procurement_items WHERE id = p_item_id FOR UPDATE;
  IF it.id IS NULL THEN RETURN NULL; END IF;
  IF NOT public.is_team_member(auth.uid(), it.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  IF it.inventory_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.products WHERE id = it.inventory_product_id) THEN
    RETURN it.inventory_product_id;
  END IF;
  SELECT count(*), min(id::text)::uuid INTO v_cnt, v_pid FROM public.products WHERE user_id = it.user_id AND name = it.name;
  IF v_cnt <> 1 THEN
    INSERT INTO public.products(user_id, name, unit, buy_price, sell_price, quantity, min_quantity, category, is_pos_available)
    VALUES (it.user_id, it.name, it.unit, coalesce(it.default_price,0), 0, 0, 0, 'بضاعة عامة', false)
    RETURNING id INTO v_pid;
  END IF;
  UPDATE public.procurement_items SET inventory_product_id = v_pid WHERE id = p_item_id;
  RETURN v_pid;
END $$;

-- Received so far for an order line = invoice lines explicitly tied to it (non-cancelled invoices)
CREATE OR REPLACE FUNCTION public._procurement_item_received_qty(_order_item_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(pii.quantity), 0)
  FROM public.purchase_invoice_items pii
  JOIN public.purchase_invoices pi ON pi.id = pii.invoice_id AND coalesce(pi.status,'') <> 'cancelled'
  WHERE pii.procurement_order_item_id = _order_item_id;
$$;

-- One call for the accountant screen: remaining qty + resolved inventory product per order line
CREATE OR REPLACE FUNCTION public.get_procurement_order_receipt_lines(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; r jsonb;
BEGIN
  SELECT * INTO o FROM public.procurement_orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الطلبية غير موجودة'; END IF;
  IF NOT public.is_team_member(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'order_item_id', i.id, 'item_name', i.item_name, 'unit', i.unit, 'unit_price', i.unit_price,
      'ordered_qty', i.quantity, 'received_before', rq.q, 'remaining', greatest(i.quantity - rq.q, 0),
      'inventory_product_id', public.ensure_procurement_item_product(i.product_id)) ORDER BY i.item_name), '[]'::jsonb)
  INTO r
  FROM public.procurement_order_items i
  CROSS JOIN LATERAL (SELECT public._procurement_item_received_qty(i.id) AS q) rq
  WHERE i.order_id = p_order_id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.assign_receiving_session(p_order_id uuid, p_employee_id uuid, p_expected_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; e record; v_id uuid;
BEGIN
  SELECT * INTO o FROM public.procurement_orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الطلبية غير موجودة'; END IF;
  IF NOT public.is_team_member(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  IF o.status NOT IN ('sent','partially_received') THEN RAISE EXCEPTION 'يمكن إسناد الطلبيات المرسلة فقط'; END IF;
  SELECT * INTO e FROM public.employees WHERE id = p_employee_id;
  IF e.id IS NULL OR e.auth_user_id IS NULL THEN RAISE EXCEPTION 'الموظف ليس لديه حساب دخول'; END IF;
  IF e.user_id <> o.user_id AND NOT public.is_team_member(e.auth_user_id, o.user_id) THEN RAISE EXCEPTION 'الموظف ليس من نفس الشركة'; END IF;
  IF EXISTS (SELECT 1 FROM public.procurement_receiving_sessions WHERE order_id = p_order_id AND status = 'submitted') THEN
    RAISE EXCEPTION 'يوجد استلام بانتظار اعتماد المحاسب لهذه الطلبية';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procurement_order_items i WHERE i.order_id = p_order_id
                 AND i.quantity > public._procurement_item_received_qty(i.id)) THEN
    RAISE EXCEPTION 'الطلبية مستلمة بالكامل';
  END IF;
  UPDATE public.procurement_receiving_sessions SET status = 'cancelled', updated_at = now()
   WHERE order_id = p_order_id AND status IN ('assigned','in_progress');
  INSERT INTO public.procurement_receiving_sessions(owner_id, order_id, assigned_employee_id, assigned_auth_user_id, expected_date)
  VALUES (o.user_id, p_order_id, e.id, e.auth_user_id, p_expected_date) RETURNING id INTO v_id;
  -- line.product_id = inventory product (for barcode matching), not the purchasing catalog id
  INSERT INTO public.procurement_receiving_lines(session_id, order_item_id, product_id)
  SELECT v_id, i.id, public.ensure_procurement_item_product(i.product_id) FROM public.procurement_order_items i
   WHERE i.order_id = p_order_id AND i.quantity > public._procurement_item_received_qty(i.id);
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.ensure_procurement_item_product(uuid), public.get_procurement_order_receipt_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_procurement_item_product(uuid), public.get_procurement_order_receipt_lines(uuid) TO authenticated;