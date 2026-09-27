-- Manager = team member with at least one back-office role (not only employee/worker/cashier/portal/waiter-type roles)
CREATE OR REPLACE FUNCTION public._is_procurement_manager(_uid uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid = _owner OR (public.is_team_member(_uid, _owner) AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _uid
      AND role::text NOT IN ('employee','worker','cashier','portal','call_center')));
$$;
REVOKE EXECUTE ON FUNCTION public._is_procurement_manager(uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public._receiving_can_access(_session_id uuid, _manage boolean DEFAULT false)
RETURNS public.procurement_receiving_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions;
BEGIN
  SELECT * INTO s FROM public.procurement_receiving_sessions WHERE id = _session_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'جلسة الاستلام غير موجودة'; END IF;
  IF public._is_procurement_manager(auth.uid(), s.owner_id) THEN RETURN s; END IF;
  IF NOT _manage AND s.assigned_auth_user_id = auth.uid() THEN RETURN s; END IF;
  RAISE EXCEPTION 'لا تملك صلاحية على هذه الجلسة';
END $$;

CREATE OR REPLACE FUNCTION public.get_procurement_order_receipt_lines(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; r jsonb;
BEGIN
  SELECT * INTO o FROM public.procurement_orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الطلبية غير موجودة'; END IF;
  IF NOT public._is_procurement_manager(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
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
  IF NOT public._is_procurement_manager(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
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
  SELECT v_id, i.id, public.ensure_procurement_item_product(i.product_id) FROM public.procurement_order_items i
   WHERE i.order_id = p_order_id AND i.quantity > public._procurement_item_received_qty(i.id);
  RETURN v_id;
END $$;