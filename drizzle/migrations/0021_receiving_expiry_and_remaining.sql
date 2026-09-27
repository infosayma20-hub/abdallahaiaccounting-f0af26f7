ALTER TABLE public.procurement_receiving_lines ADD COLUMN IF NOT EXISTS expiry_date date;

-- Quantity already invoiced (received) for an order line from non-cancelled purchase invoices
CREATE OR REPLACE FUNCTION public._procurement_item_received_qty(_order_item_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(pii.quantity), 0)
  FROM public.procurement_order_items oi
  JOIN public.purchase_invoices pi ON pi.procurement_order_id = oi.order_id AND coalesce(pi.status,'') <> 'cancelled'
  JOIN public.purchase_invoice_items pii ON pii.invoice_id = pi.id
   AND ((oi.product_id IS NOT NULL AND pii.product_id = oi.product_id)
        OR (oi.product_id IS NULL AND pii.product_id IS NULL AND pii.product_name = oi.item_name))
  WHERE oi.id = _order_item_id;
$$;
REVOKE EXECUTE ON FUNCTION public._procurement_item_received_qty(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._procurement_item_received_qty(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_receiving_sessions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', s.id, 'status', s.status, 'expected_date', s.expected_date, 'created_at', s.created_at,
      'order_number', o.order_number, 'supplier_name', sp.name,
      'items_count', (SELECT count(*) FROM public.procurement_receiving_lines l WHERE l.session_id = s.id),
      'ordered_total', (SELECT coalesce(sum(greatest(i.quantity - public._procurement_item_received_qty(i.id), 0)),0)
                         FROM public.procurement_receiving_lines l JOIN public.procurement_order_items i ON i.id=l.order_item_id WHERE l.session_id = s.id),
      'scanned_total', (SELECT coalesce(sum(l.scanned_qty),0) FROM public.procurement_receiving_lines l WHERE l.session_id = s.id)) AS x
    FROM public.procurement_receiving_sessions s
    JOIN public.procurement_orders o ON o.id = s.order_id
    LEFT JOIN public.pos_suppliers sp ON sp.id = o.supplier_id
    WHERE s.assigned_auth_user_id = auth.uid() AND s.status IN ('assigned','in_progress','submitted')
  ) t;
$$;

CREATE OR REPLACE FUNCTION public.get_receiving_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions; r jsonb;
BEGIN
  s := public._receiving_can_access(p_session_id, false);
  SELECT jsonb_build_object('id', s.id, 'status', s.status, 'order_id', s.order_id, 'expected_date', s.expected_date,
    'order_number', o.order_number, 'supplier_name', sp.name,
    'employee_name', (SELECT full_name FROM public.employees WHERE id = s.assigned_employee_id),
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'order_item_id', l.order_item_id, 'product_id', l.product_id,
        'item_name', i.item_name, 'unit', i.unit,
        'ordered_qty', i.quantity,
        'received_before', rb.q,
        'target_qty', greatest(i.quantity - rb.q, 0),
        'scanned_qty', l.scanned_qty, 'note', l.note, 'expiry_date', l.expiry_date,
        'barcode', p.barcode, 'extra_barcodes', l.barcodes) ORDER BY i.item_name)
      FROM public.procurement_receiving_lines l
      JOIN public.procurement_order_items i ON i.id = l.order_item_id
      CROSS JOIN LATERAL (SELECT public._procurement_item_received_qty(i.id) AS q) rb
      LEFT JOIN public.products p ON p.id = l.product_id
      WHERE l.session_id = s.id), '[]'::jsonb))
  INTO r
  FROM public.procurement_orders o LEFT JOIN public.pos_suppliers sp ON sp.id = o.supplier_id
  WHERE o.id = s.order_id;
  RETURN r;
END $$;

DROP FUNCTION IF EXISTS public.receiving_set_line(uuid, numeric, text);
CREATE FUNCTION public.receiving_set_line(p_line_id uuid, p_qty numeric, p_note text DEFAULT NULL, p_expiry date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sid uuid; s public.procurement_receiving_sessions;
BEGIN
  SELECT session_id INTO v_sid FROM public.procurement_receiving_lines WHERE id = p_line_id;
  IF v_sid IS NULL THEN RAISE EXCEPTION 'البند غير موجود'; END IF;
  s := public._receiving_can_access(v_sid, false);
  PERFORM public._receiving_assert_editable(s);
  IF p_qty IS NULL OR p_qty < 0 THEN RAISE EXCEPTION 'الكمية لا يمكن أن تكون سالبة'; END IF;
  IF p_expiry IS NOT NULL AND p_expiry < current_date THEN RAISE EXCEPTION 'تاريخ الانتهاء لا يمكن أن يكون بالماضي'; END IF;
  UPDATE public.procurement_receiving_lines
     SET scanned_qty = p_qty, note = nullif(btrim(coalesce(p_note,'')),''), expiry_date = p_expiry, updated_at = now()
   WHERE id = p_line_id;
  UPDATE public.procurement_receiving_sessions SET status='in_progress', started_at=coalesce(started_at, now()), updated_at=now() WHERE id = v_sid;
END $$;

CREATE OR REPLACE FUNCTION public.receiving_submit(p_session_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions; v_missing text;
BEGIN
  s := public._receiving_can_access(p_session_id, false);
  PERFORM public._receiving_assert_editable(s);
  IF NOT EXISTS (SELECT 1 FROM public.procurement_receiving_lines WHERE session_id = p_session_id AND scanned_qty > 0) THEN
    RAISE EXCEPTION 'لم يتم استلام أي صنف بعد';
  END IF;
  SELECT string_agg(i.item_name, '، ') INTO v_missing
  FROM public.procurement_receiving_lines l JOIN public.procurement_order_items i ON i.id = l.order_item_id
  WHERE l.session_id = p_session_id AND l.scanned_qty > 0 AND l.expiry_date IS NULL;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'تاريخ الانتهاء إجباري للأصناف: %', v_missing; END IF;
  UPDATE public.procurement_receiving_sessions SET status='submitted', submitted_at=now(), notes=coalesce(p_notes, notes), updated_at=now() WHERE id = p_session_id;
END $$;

-- Block assigning an order that is fully received
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
  INSERT INTO public.procurement_receiving_lines(session_id, order_item_id, product_id)
  SELECT v_id, i.id, i.product_id FROM public.procurement_order_items i
   WHERE i.order_id = p_order_id AND i.quantity > public._procurement_item_received_qty(i.id);
  RETURN v_id;
END $$;

-- Order status from cumulative received quantities (called after posting a purchase invoice)
CREATE OR REPLACE FUNCTION public.refresh_procurement_order_receipt_status(p_order_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_any boolean; v_all boolean; v_status text;
BEGIN
  SELECT * INTO o FROM public.procurement_orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الطلبية غير موجودة'; END IF;
  IF NOT public.is_team_member(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  IF o.status = 'cancelled' THEN RETURN o.status; END IF;
  SELECT bool_or(public._procurement_item_received_qty(i.id) > 0),
         bool_and(public._procurement_item_received_qty(i.id) >= i.quantity)
    INTO v_any, v_all
  FROM public.procurement_order_items i WHERE i.order_id = p_order_id;
  v_status := CASE WHEN coalesce(v_all,false) THEN 'received' WHEN coalesce(v_any,false) THEN 'partially_received' ELSE o.status END;
  UPDATE public.procurement_orders SET status = v_status, updated_at = now() WHERE id = p_order_id AND status IS DISTINCT FROM v_status;
  RETURN v_status;
END $$;

-- Approve the submitted session whenever a purchase invoice is posted for the order (covers partial→partial too)
CREATE OR REPLACE FUNCTION public.trg_purchase_invoice_approve_receiving()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.procurement_order_id IS NOT NULL THEN
    UPDATE public.procurement_receiving_sessions SET status='approved', approved_at=now(), updated_at=now()
     WHERE order_id = NEW.procurement_order_id AND status = 'submitted';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS purchase_invoice_approve_receiving ON public.purchase_invoices;
CREATE TRIGGER purchase_invoice_approve_receiving AFTER INSERT ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_invoice_approve_receiving();

GRANT EXECUTE ON FUNCTION public.receiving_set_line(uuid, numeric, text, date), public.refresh_procurement_order_receipt_status(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.receiving_set_line(uuid, numeric, text, date), public.refresh_procurement_order_receipt_status(uuid) FROM anon;