CREATE TABLE public.procurement_receiving_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.procurement_orders(id) ON DELETE CASCADE,
  assigned_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  assigned_auth_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'assigned',
  expected_date date,
  started_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prs_order ON public.procurement_receiving_sessions(order_id);
CREATE INDEX idx_prs_assignee ON public.procurement_receiving_sessions(assigned_auth_user_id, status);

CREATE TABLE public.procurement_receiving_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.procurement_receiving_sessions(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.procurement_order_items(id) ON DELETE CASCADE,
  product_id uuid,
  scanned_qty numeric NOT NULL DEFAULT 0,
  note text,
  barcodes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, order_item_id)
);
CREATE INDEX idx_prl_session ON public.procurement_receiving_lines(session_id);

GRANT SELECT ON public.procurement_receiving_sessions TO authenticated;
GRANT SELECT ON public.procurement_receiving_lines TO authenticated;
GRANT ALL ON public.procurement_receiving_sessions TO service_role;
GRANT ALL ON public.procurement_receiving_lines TO service_role;

ALTER TABLE public.procurement_receiving_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_receiving_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team or assignee can view receiving sessions" ON public.procurement_receiving_sessions
FOR SELECT TO authenticated
USING (assigned_auth_user_id = (select auth.uid()) OR public.is_team_member((select auth.uid()), owner_id));

CREATE POLICY "Team or assignee can view receiving lines" ON public.procurement_receiving_lines
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.procurement_receiving_sessions s WHERE s.id = session_id
  AND (s.assigned_auth_user_id = (select auth.uid()) OR public.is_team_member((select auth.uid()), s.owner_id))));

-- helper: access check
CREATE OR REPLACE FUNCTION public._receiving_can_access(_session_id uuid, _manage boolean DEFAULT false)
RETURNS public.procurement_receiving_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions;
BEGIN
  SELECT * INTO s FROM public.procurement_receiving_sessions WHERE id = _session_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'جلسة الاستلام غير موجودة'; END IF;
  IF public.is_team_member(auth.uid(), s.owner_id) THEN RETURN s; END IF;
  IF NOT _manage AND s.assigned_auth_user_id = auth.uid() THEN RETURN s; END IF;
  RAISE EXCEPTION 'لا تملك صلاحية على هذه الجلسة';
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
  IF NOT public.is_team_member(e.auth_user_id, o.user_id) AND e.user_id <> o.user_id THEN RAISE EXCEPTION 'الموظف ليس من نفس الشركة'; END IF;
  IF EXISTS (SELECT 1 FROM public.procurement_receiving_sessions WHERE order_id = p_order_id AND status = 'submitted') THEN
    RAISE EXCEPTION 'يوجد استلام بانتظار اعتماد المحاسب لهذه الطلبية';
  END IF;
  UPDATE public.procurement_receiving_sessions SET status = 'cancelled', updated_at = now()
   WHERE order_id = p_order_id AND status IN ('assigned','in_progress');
  INSERT INTO public.procurement_receiving_sessions(owner_id, order_id, assigned_employee_id, assigned_auth_user_id, expected_date)
  VALUES (o.user_id, p_order_id, e.id, e.auth_user_id, p_expected_date) RETURNING id INTO v_id;
  INSERT INTO public.procurement_receiving_lines(session_id, order_item_id, product_id)
  SELECT v_id, i.id, i.product_id FROM public.procurement_order_items i WHERE i.order_id = p_order_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_receiving_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions;
BEGIN
  s := public._receiving_can_access(p_session_id, true);
  IF s.status = 'approved' THEN RAISE EXCEPTION 'الاستلام معتمد ولا يمكن إلغاؤه'; END IF;
  UPDATE public.procurement_receiving_sessions SET status='cancelled', updated_at=now() WHERE id = p_session_id;
END $$;

CREATE OR REPLACE FUNCTION public.reopen_receiving_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions;
BEGIN
  s := public._receiving_can_access(p_session_id, true);
  IF s.status <> 'submitted' THEN RAISE EXCEPTION 'يمكن إعادة فتح الاستلام المرسل فقط'; END IF;
  UPDATE public.procurement_receiving_sessions SET status='in_progress', submitted_at=NULL, updated_at=now() WHERE id = p_session_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_receiving_sessions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', s.id, 'status', s.status, 'expected_date', s.expected_date, 'created_at', s.created_at,
      'order_number', o.order_number, 'supplier_name', sp.name,
      'items_count', (SELECT count(*) FROM public.procurement_receiving_lines l WHERE l.session_id = s.id),
      'ordered_total', (SELECT coalesce(sum(i.quantity),0) FROM public.procurement_receiving_lines l JOIN public.procurement_order_items i ON i.id=l.order_item_id WHERE l.session_id = s.id),
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
        'item_name', i.item_name, 'unit', i.unit, 'ordered_qty', i.quantity,
        'scanned_qty', l.scanned_qty, 'note', l.note,
        'barcode', p.barcode, 'extra_barcodes', l.barcodes) ORDER BY i.item_name)
      FROM public.procurement_receiving_lines l
      JOIN public.procurement_order_items i ON i.id = l.order_item_id
      LEFT JOIN public.products p ON p.id = l.product_id
      WHERE l.session_id = s.id), '[]'::jsonb))
  INTO r
  FROM public.procurement_orders o LEFT JOIN public.pos_suppliers sp ON sp.id = o.supplier_id
  WHERE o.id = s.order_id;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public._receiving_assert_editable(s public.procurement_receiving_sessions)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF s.status NOT IN ('assigned','in_progress') THEN RAISE EXCEPTION 'الاستلام مغلق ولا يمكن تعديله'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.receiving_scan(p_session_id uuid, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions; v_line uuid; v_name text; v_qty numeric; v_code text := btrim(p_barcode);
BEGIN
  s := public._receiving_can_access(p_session_id, false);
  PERFORM public._receiving_assert_editable(s);
  IF v_code = '' THEN RETURN jsonb_build_object('ok', false, 'reason', 'empty'); END IF;
  SELECT l.id, i.item_name INTO v_line, v_name
  FROM public.procurement_receiving_lines l
  JOIN public.procurement_order_items i ON i.id = l.order_item_id
  LEFT JOIN public.products p ON p.id = l.product_id
  WHERE l.session_id = p_session_id AND (p.barcode = v_code OR v_code = ANY(l.barcodes) OR p.sku = v_code)
  ORDER BY (l.scanned_qty >= i.quantity), i.item_name LIMIT 1;
  IF v_line IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown', 'barcode', v_code); END IF;
  UPDATE public.procurement_receiving_lines SET scanned_qty = scanned_qty + 1, updated_at = now() WHERE id = v_line RETURNING scanned_qty INTO v_qty;
  UPDATE public.procurement_receiving_sessions SET status='in_progress', started_at=coalesce(started_at, now()), updated_at=now() WHERE id = p_session_id;
  RETURN jsonb_build_object('ok', true, 'line_id', v_line, 'item_name', v_name, 'scanned_qty', v_qty);
END $$;

CREATE OR REPLACE FUNCTION public.receiving_set_line(p_line_id uuid, p_qty numeric, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sid uuid; s public.procurement_receiving_sessions;
BEGIN
  SELECT session_id INTO v_sid FROM public.procurement_receiving_lines WHERE id = p_line_id;
  s := public._receiving_can_access(v_sid, false);
  PERFORM public._receiving_assert_editable(s);
  IF p_qty < 0 THEN RAISE EXCEPTION 'الكمية لا يمكن أن تكون سالبة'; END IF;
  UPDATE public.procurement_receiving_lines SET scanned_qty = p_qty, note = p_note, updated_at = now() WHERE id = p_line_id;
  UPDATE public.procurement_receiving_sessions SET status='in_progress', started_at=coalesce(started_at, now()), updated_at=now() WHERE id = v_sid;
END $$;

CREATE OR REPLACE FUNCTION public.receiving_link_barcode(p_line_id uuid, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sid uuid; v_pid uuid; s public.procurement_receiving_sessions; v_code text := btrim(p_barcode); v_other text; v_saved boolean := false;
BEGIN
  SELECT session_id, product_id INTO v_sid, v_pid FROM public.procurement_receiving_lines WHERE id = p_line_id;
  s := public._receiving_can_access(v_sid, false);
  PERFORM public._receiving_assert_editable(s);
  IF v_code = '' THEN RAISE EXCEPTION 'باركود فارغ'; END IF;
  SELECT name INTO v_other FROM public.products WHERE user_id = s.owner_id AND barcode = v_code AND id IS DISTINCT FROM v_pid LIMIT 1;
  IF v_other IS NOT NULL THEN RAISE EXCEPTION 'هذا الباركود مستخدم للصنف: %', v_other; END IF;
  IF v_pid IS NOT NULL THEN
    UPDATE public.products SET barcode = v_code, updated_at = now()
     WHERE id = v_pid AND (barcode IS NULL OR btrim(barcode) = '') RETURNING true INTO v_saved;
  END IF;
  UPDATE public.procurement_receiving_lines
     SET barcodes = CASE WHEN coalesce(v_saved,false) OR v_code = ANY(barcodes) THEN barcodes ELSE array_append(barcodes, v_code) END,
         scanned_qty = scanned_qty + 1, updated_at = now()
   WHERE id = p_line_id;
  UPDATE public.procurement_receiving_sessions SET status='in_progress', started_at=coalesce(started_at, now()), updated_at=now() WHERE id = v_sid;
  RETURN jsonb_build_object('ok', true, 'saved_to_product', coalesce(v_saved,false));
END $$;

CREATE OR REPLACE FUNCTION public.receiving_generate_barcode(p_line_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sid uuid; v_pid uuid; v_cur text; s public.procurement_receiving_sessions; v_base text; v_sum int; v_code text; k int; tries int := 0;
BEGIN
  SELECT l.session_id, l.product_id, p.barcode INTO v_sid, v_pid, v_cur
  FROM public.procurement_receiving_lines l LEFT JOIN public.products p ON p.id = l.product_id WHERE l.id = p_line_id;
  s := public._receiving_can_access(v_sid, false);
  IF v_pid IS NULL THEN RAISE EXCEPTION 'البند غير مرتبط بصنف في النظام'; END IF;
  IF v_cur IS NOT NULL AND btrim(v_cur) <> '' THEN RETURN v_cur; END IF;
  LOOP
    tries := tries + 1;
    v_base := '200' || lpad((floor(random()*1e9))::bigint::text, 9, '0');
    v_sum := 0;
    FOR k IN 1..12 LOOP
      v_sum := v_sum + substr(v_base, k, 1)::int * CASE WHEN k % 2 = 0 THEN 3 ELSE 1 END;
    END LOOP;
    v_code := v_base || ((10 - v_sum % 10) % 10)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE user_id = s.owner_id AND barcode = v_code) OR tries > 20;
  END LOOP;
  UPDATE public.products SET barcode = v_code, updated_at = now() WHERE id = v_pid;
  RETURN v_code;
END $$;

CREATE OR REPLACE FUNCTION public.receiving_submit(p_session_id uuid, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.procurement_receiving_sessions;
BEGIN
  s := public._receiving_can_access(p_session_id, false);
  PERFORM public._receiving_assert_editable(s);
  IF NOT EXISTS (SELECT 1 FROM public.procurement_receiving_lines WHERE session_id = p_session_id AND scanned_qty > 0) THEN
    RAISE EXCEPTION 'لم يتم استلام أي صنف بعد';
  END IF;
  UPDATE public.procurement_receiving_sessions SET status='submitted', submitted_at=now(), notes=coalesce(p_notes, notes), updated_at=now() WHERE id = p_session_id;
END $$;

-- When the accountant posts the receipt (order becomes received / partially received), approve the submitted session
CREATE OR REPLACE FUNCTION public.trg_procurement_order_approve_receiving()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('received','partially_received') AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.procurement_receiving_sessions SET status='approved', approved_at=now(), updated_at=now()
     WHERE order_id = NEW.id AND status = 'submitted';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER procurement_order_approve_receiving AFTER UPDATE OF status ON public.procurement_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_procurement_order_approve_receiving();

REVOKE EXECUTE ON FUNCTION public._receiving_can_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_receiving_session(uuid, uuid, date), public.cancel_receiving_session(uuid), public.reopen_receiving_session(uuid),
  public.get_my_receiving_sessions(), public.get_receiving_session(uuid), public.receiving_scan(uuid, text), public.receiving_set_line(uuid, numeric, text),
  public.receiving_link_barcode(uuid, text), public.receiving_generate_barcode(uuid), public.receiving_submit(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_receiving_session(uuid, uuid, date), public.cancel_receiving_session(uuid), public.reopen_receiving_session(uuid),
  public.get_my_receiving_sessions(), public.get_receiving_session(uuid), public.receiving_scan(uuid, text), public.receiving_set_line(uuid, numeric, text),
  public.receiving_link_barcode(uuid, text), public.receiving_generate_barcode(uuid), public.receiving_submit(uuid, text) FROM anon;