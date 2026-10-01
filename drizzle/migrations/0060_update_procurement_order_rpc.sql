CREATE TABLE IF NOT EXISTS public.procurement_order_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  edited_by uuid,
  edited_at timestamptz NOT NULL DEFAULT now(),
  status_at_edit text,
  before_data jsonb NOT NULL,
  after_data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_po_edits_order ON public.procurement_order_edits(order_id, edited_at DESC);
GRANT SELECT ON public.procurement_order_edits TO authenticated;
GRANT ALL ON public.procurement_order_edits TO service_role;
ALTER TABLE public.procurement_order_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members read order edits" ON public.procurement_order_edits
  FOR SELECT TO authenticated USING (public.is_team_member((SELECT auth.uid()), owner_id));

-- يعيد سبب منع التعديل أو NULL إذا التعديل مسموح
CREATE OR REPLACE FUNCTION public.procurement_order_edit_block_reason(p_order_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM procurement_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 'الطلبية غير موجودة'; END IF;
  IF NOT is_team_member(auth.uid(), o.user_id) THEN RETURN 'لا تملك صلاحية على هذه الطلبية'; END IF;
  IF o.status NOT IN ('draft','sent','partially_received') THEN
    RETURN 'لا يمكن تعديل طلبية بحالة ' || coalesce(o.status,'');
  END IF;
  IF EXISTS (SELECT 1 FROM procurement_receiving_sessions s
             WHERE s.order_id = p_order_id AND s.status NOT IN ('cancelled','approved')) THEN
    RETURN 'الاستلام بالمستودع جارٍ أو مُرسل على هذه الطلبية';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.procurement_order_edit_block_reason(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_order_edit_block_reason(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_procurement_order(p_order_id uuid, p_header jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record; v_reason text; v_before jsonb; v_after jsonb;
  it jsonb; v_id uuid; v_qty numeric; v_price numeric; v_recv numeric;
  v_keep uuid[] := '{}'; r record; v_has_invoice boolean; v_total numeric;
BEGIN
  SELECT * INTO o FROM procurement_orders WHERE id = p_order_id FOR UPDATE;
  v_reason := procurement_order_edit_block_reason(p_order_id);
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا يمكن حفظ طلبية بلا بنود';
  END IF;

  v_has_invoice := EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.procurement_order_id = p_order_id
                           AND coalesce(pi.status,'') NOT IN ('cancelled','rejected'));
  IF v_has_invoice AND (p_header->>'supplier_id') IS NOT NULL
     AND (p_header->>'supplier_id')::uuid IS DISTINCT FROM o.supplier_id THEN
    RAISE EXCEPTION 'لا يمكن تغيير المورد بعد فوترة جزء من الطلبية';
  END IF;

  v_before := jsonb_build_object('order', to_jsonb(o),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM procurement_order_items i WHERE i.order_id = p_order_id), '[]'));

  -- البنود الموجودة والمُرسلة
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (it->>'quantity')::numeric;
    v_price := coalesce((it->>'unit_price')::numeric, 0);
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صحيحة للبند %', it->>'item_name'; END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'سعر غير صحيح للبند %', it->>'item_name'; END IF;
    v_id := NULLIF(it->>'id','')::uuid;
    IF v_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM procurement_order_items WHERE id = v_id AND order_id = p_order_id) THEN
        RAISE EXCEPTION 'بند لا يتبع هذه الطلبية';
      END IF;
      v_recv := _procurement_item_received_qty(v_id);
      IF v_qty < v_recv THEN
        RAISE EXCEPTION 'كمية البند % أقل من المستلم (%)', it->>'item_name', v_recv;
      END IF;
      UPDATE procurement_order_items SET
        quantity = v_qty, unit_price = v_price, total_price = round(v_qty * v_price, 2),
        unit = coalesce(it->>'unit', unit),
        notes = NULLIF(it->>'notes',''),
        branch_id = NULLIF(it->>'branch_id','')::uuid,
        -- لا يُغيَّر الصنف أو اسمه لبند عليه استلام
        product_id = CASE WHEN v_recv > 0 THEN product_id ELSE NULLIF(it->>'product_id','')::uuid END,
        item_name = CASE WHEN v_recv > 0 THEN item_name ELSE coalesce(it->>'item_name', item_name) END
      WHERE id = v_id;
      v_keep := v_keep || v_id;
    ELSE
      INSERT INTO procurement_order_items(order_id, product_id, item_name, unit, quantity, unit_price, total_price, branch_id, notes)
      VALUES (p_order_id, NULLIF(it->>'product_id','')::uuid, it->>'item_name', it->>'unit', v_qty, v_price,
              round(v_qty * v_price, 2), NULLIF(it->>'branch_id','')::uuid, NULLIF(it->>'notes',''))
      RETURNING id INTO v_id;
      v_keep := v_keep || v_id;
    END IF;
  END LOOP;

  -- حذف البنود المُزالة فقط إذا لا استلام ولا فاتورة عليها
  FOR r IN SELECT id, item_name FROM procurement_order_items WHERE order_id = p_order_id AND NOT (id = ANY(v_keep)) LOOP
    IF EXISTS (SELECT 1 FROM purchase_invoice_items WHERE procurement_order_item_id = r.id)
       OR EXISTS (SELECT 1 FROM procurement_receiving_lines WHERE order_item_id = r.id) THEN
      RAISE EXCEPTION 'لا يمكن حذف البند % لأنه مرتبط باستلام أو فاتورة', r.item_name;
    END IF;
    DELETE FROM procurement_order_items WHERE id = r.id;
  END LOOP;

  SELECT coalesce(sum(total_price),0) INTO v_total FROM procurement_order_items WHERE order_id = p_order_id;
  UPDATE procurement_orders SET
    supplier_id = coalesce(NULLIF(p_header->>'supplier_id','')::uuid, supplier_id),
    branch_id = CASE WHEN p_header ? 'branch_id' THEN NULLIF(p_header->>'branch_id','')::uuid ELSE branch_id END,
    order_date = coalesce(NULLIF(p_header->>'order_date','')::date, order_date),
    expected_delivery_date = CASE WHEN p_header ? 'expected_delivery_date' THEN NULLIF(p_header->>'expected_delivery_date','')::date ELSE expected_delivery_date END,
    notes = CASE WHEN p_header ? 'notes' THEN NULLIF(p_header->>'notes','') ELSE notes END,
    total_amount = v_total,
    updated_at = now()
  WHERE id = p_order_id;

  v_after := jsonb_build_object('order', (SELECT to_jsonb(x) FROM procurement_orders x WHERE x.id = p_order_id),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM procurement_order_items i WHERE i.order_id = p_order_id), '[]'));
  INSERT INTO procurement_order_edits(order_id, owner_id, edited_by, status_at_edit, before_data, after_data)
  VALUES (p_order_id, o.user_id, auth.uid(), o.status, v_before, v_after);

  RETURN jsonb_build_object('ok', true, 'total_amount', v_total);
END $$;
REVOKE ALL ON FUNCTION public.update_procurement_order(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_procurement_order(uuid, jsonb, jsonb) TO authenticated;