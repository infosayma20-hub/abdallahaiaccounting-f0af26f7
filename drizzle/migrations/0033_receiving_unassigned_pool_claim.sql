-- Receivers see sent orders with no active session; opening one auto-assigns it to them (atomic claim).
CREATE OR REPLACE FUNCTION public.claim_receiving_order(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record; e record; v_id uuid;
BEGIN
  SELECT * INTO o FROM public.procurement_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الطلبية غير موجودة'; END IF;
  IF o.status NOT IN ('sent','partially_received') THEN RAISE EXCEPTION 'الطلبية غير متاحة للاستلام'; END IF;
  SELECT * INTO e FROM public.employees
   WHERE auth_user_id = auth.uid() AND is_receiver AND is_active AND NOT coalesce(is_terminated,false)
     AND (user_id = o.user_id OR public.is_team_member(auth.uid(), o.user_id))
   LIMIT 1;
  IF e.id IS NULL THEN RAISE EXCEPTION 'لا تملك صلاحية موظف مستودع لهذه الطلبية'; END IF;
  SELECT id INTO v_id FROM public.procurement_receiving_sessions
   WHERE order_id = p_order_id AND status IN ('assigned','in_progress','submitted') LIMIT 1;
  IF v_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.procurement_receiving_sessions WHERE id = v_id AND assigned_auth_user_id = auth.uid()) THEN RETURN v_id; END IF;
    RAISE EXCEPTION 'الطلبية مسندة لموظف آخر';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.procurement_order_items i WHERE i.order_id = p_order_id
                 AND i.quantity > public._procurement_item_received_qty(i.id)) THEN
    RAISE EXCEPTION 'الطلبية مستلمة بالكامل';
  END IF;
  INSERT INTO public.procurement_receiving_sessions(owner_id, order_id, assigned_employee_id, assigned_auth_user_id, expected_date)
  VALUES (o.user_id, p_order_id, e.id, e.auth_user_id, o.expected_delivery_date) RETURNING id INTO v_id;
  INSERT INTO public.procurement_receiving_lines(session_id, order_item_id, product_id)
  SELECT v_id, i.id, public.ensure_procurement_item_product(i.product_id) FROM public.procurement_order_items i
   WHERE i.order_id = p_order_id AND i.quantity > public._procurement_item_received_qty(i.id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_receiving_order(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_receiving_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_receiving_sessions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', s.id, 'order_id', o.id, 'status', s.status, 'expected_date', s.expected_date, 'created_at', s.created_at,
      'order_number', o.order_number, 'supplier_name', sp.name,
      'items_count', (SELECT count(*) FROM public.procurement_receiving_lines l WHERE l.session_id = s.id),
      'ordered_total', (SELECT coalesce(sum(greatest(i.quantity - public._procurement_item_received_qty(i.id), 0)),0)
                         FROM public.procurement_receiving_lines l JOIN public.procurement_order_items i ON i.id=l.order_item_id WHERE l.session_id = s.id),
      'scanned_total', (SELECT coalesce(sum(l.scanned_qty),0) FROM public.procurement_receiving_lines l WHERE l.session_id = s.id)) AS x
    FROM public.procurement_receiving_sessions s
    JOIN public.procurement_orders o ON o.id = s.order_id
    LEFT JOIN public.pos_suppliers sp ON sp.id = o.supplier_id
    WHERE s.assigned_auth_user_id = auth.uid() AND s.status IN ('assigned','in_progress','submitted')
    UNION ALL
    SELECT jsonb_build_object('id', NULL, 'order_id', o.id, 'status', 'available', 'expected_date', o.expected_delivery_date, 'created_at', o.created_at,
      'order_number', o.order_number, 'supplier_name', sp.name,
      'items_count', (SELECT count(*) FROM public.procurement_order_items i WHERE i.order_id = o.id AND i.quantity > public._procurement_item_received_qty(i.id)),
      'ordered_total', (SELECT coalesce(sum(greatest(i.quantity - public._procurement_item_received_qty(i.id), 0)),0) FROM public.procurement_order_items i WHERE i.order_id = o.id),
      'scanned_total', 0)
    FROM public.procurement_orders o
    LEFT JOIN public.pos_suppliers sp ON sp.id = o.supplier_id
    WHERE o.status IN ('sent','partially_received')
      AND EXISTS (SELECT 1 FROM public.employees e WHERE e.auth_user_id = auth.uid() AND e.is_receiver AND e.is_active
                  AND NOT coalesce(e.is_terminated,false) AND (e.user_id = o.user_id OR public.is_team_member(auth.uid(), o.user_id)))
      AND NOT EXISTS (SELECT 1 FROM public.procurement_receiving_sessions s WHERE s.order_id = o.id AND s.status IN ('assigned','in_progress','submitted'))
      AND EXISTS (SELECT 1 FROM public.procurement_order_items i WHERE i.order_id = o.id AND i.quantity > public._procurement_item_received_qty(i.id))
  ) t;
$$;