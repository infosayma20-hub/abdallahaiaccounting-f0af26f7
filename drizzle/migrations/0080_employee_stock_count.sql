ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS can_stock_count boolean NOT NULL DEFAULT false;

CREATE TABLE public.stock_count_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  branch_id uuid REFERENCES public.branches(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  system_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  employee_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  applied_delta numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_count_entries_owner_status_idx ON public.stock_count_entries(user_id, status, created_at DESC);
GRANT SELECT ON public.stock_count_entries TO authenticated;
GRANT ALL ON public.stock_count_entries TO service_role;
ALTER TABLE public.stock_count_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or team admin/accountant view counts" ON public.stock_count_entries
FOR SELECT TO authenticated USING (
  (SELECT auth.uid()) = user_id
  OR (public.is_team_member((SELECT auth.uid()), user_id) AND (
      public.has_role((SELECT auth.uid()), 'admin'::app_role)
   OR public.has_role((SELECT auth.uid()), 'accountant_senior'::app_role)
   OR public.has_role((SELECT auth.uid()), 'accountant_purchases'::app_role)))
);

CREATE TABLE public.product_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  employee_id uuid REFERENCES public.employees(id),
  changed_by uuid,
  field text NOT NULL,
  old_value text,
  new_value text,
  source text NOT NULL DEFAULT 'stock_count',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_edit_log_owner_idx ON public.product_edit_log(user_id, created_at DESC);
GRANT SELECT ON public.product_edit_log TO authenticated;
GRANT ALL ON public.product_edit_log TO service_role;
ALTER TABLE public.product_edit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or team admin/accountant view product edits" ON public.product_edit_log
FOR SELECT TO authenticated USING (
  (SELECT auth.uid()) = user_id
  OR (public.is_team_member((SELECT auth.uid()), user_id) AND (
      public.has_role((SELECT auth.uid()), 'admin'::app_role)
   OR public.has_role((SELECT auth.uid()), 'accountant_senior'::app_role)
   OR public.has_role((SELECT auth.uid()), 'accountant_purchases'::app_role)))
);

-- سياق الموظف: الفرع والمستودع
CREATE OR REPLACE FUNCTION public.stock_count_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; w record; b text;
BEGIN
  SELECT id, user_id, branch_id, full_name, can_stock_count INTO e
    FROM public.employees WHERE auth_user_id = auth.uid() AND is_active AND NOT COALESCE(is_terminated,false) LIMIT 1;
  IF e.id IS NULL OR NOT e.can_stock_count THEN
    RAISE EXCEPTION 'لا تملك صلاحية جرد المخزون' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO b FROM public.branches WHERE id = e.branch_id;
  SELECT wh.id, wh.name INTO w FROM public.warehouses wh
   WHERE wh.user_id = e.user_id AND wh.is_active AND (
     wh.branch_id = e.branch_id
     OR wh.business_unit_id = (SELECT business_unit_id FROM public.branches WHERE id = e.branch_id))
   ORDER BY (wh.branch_id = e.branch_id) DESC NULLS LAST, wh.is_default DESC LIMIT 1;
  RETURN jsonb_build_object('employee_id', e.id, 'branch_id', e.branch_id, 'branch_name', b,
    'warehouse_id', w.id, 'warehouse_name', w.name);
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_lookup(p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb; v_owner uuid; p record; v_qty numeric; v_pending numeric;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  SELECT pr.id, pr.name, pr.sell_price, pr.barcode, pr.unit INTO p FROM public.products pr
   WHERE pr.user_id = v_owner AND (
     pr.barcode = ANY(public._barcode_variants(p_code)) OR pr.sku = btrim(p_code)
     OR pr.id IN (SELECT pb.product_id FROM public.product_barcodes pb
                   WHERE pb.user_id = v_owner AND pb.barcode = ANY(public._barcode_variants(p_code))))
   LIMIT 1;
  IF p.id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(quantity_on_hand,0) INTO v_qty FROM public.product_warehouse_balances
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid;
  SELECT counted_qty INTO v_pending FROM public.stock_count_entries
   WHERE product_id = p.id AND warehouse_id = (ctx->>'warehouse_id')::uuid AND status = 'pending'
   ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('id', p.id, 'name', p.name, 'sell_price', p.sell_price, 'barcode', p.barcode,
    'unit', p.unit, 'system_qty', COALESCE(v_qty,0), 'pending_qty', v_pending);
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_submit(p_product_id uuid, p_name text DEFAULT NULL, p_sell_price numeric DEFAULT NULL, p_counted_qty numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb; v_emp uuid; v_owner uuid; p record; v_qty numeric; v_wh uuid; v_changed int := 0;
BEGIN
  ctx := public.stock_count_context();
  v_emp := (ctx->>'employee_id')::uuid;
  v_wh := (ctx->>'warehouse_id')::uuid;
  SELECT user_id INTO v_owner FROM public.employees WHERE id = v_emp;
  SELECT id, name, sell_price INTO p FROM public.products WHERE id = p_product_id AND user_id = v_owner FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF p_sell_price IS NOT NULL AND p_sell_price < 0 THEN RAISE EXCEPTION 'سعر البيع غير صالح'; END IF;
  IF p_counted_qty IS NOT NULL AND p_counted_qty < 0 THEN RAISE EXCEPTION 'الكمية غير صالحة'; END IF;

  IF NULLIF(btrim(p_name),'') IS NOT NULL AND btrim(p_name) <> p.name THEN
    UPDATE public.products SET name = btrim(p_name) WHERE id = p.id;
    INSERT INTO public.product_edit_log(user_id, product_id, employee_id, changed_by, field, old_value, new_value)
    VALUES (v_owner, p.id, v_emp, auth.uid(), 'name', p.name, btrim(p_name));
    v_changed := v_changed + 1;
  END IF;
  IF p_sell_price IS NOT NULL AND p_sell_price IS DISTINCT FROM p.sell_price THEN
    UPDATE public.products SET sell_price = p_sell_price WHERE id = p.id;
    INSERT INTO public.product_edit_log(user_id, product_id, employee_id, changed_by, field, old_value, new_value)
    VALUES (v_owner, p.id, v_emp, auth.uid(), 'sell_price', p.sell_price::text, p_sell_price::text);
    v_changed := v_changed + 1;
  END IF;
  IF p_counted_qty IS NOT NULL THEN
    IF v_wh IS NULL THEN RAISE EXCEPTION 'لا يوجد مستودع مربوط بفرعك — راجع الإدارة'; END IF;
    SELECT COALESCE(quantity_on_hand,0) INTO v_qty FROM public.product_warehouse_balances
     WHERE product_id = p.id AND warehouse_id = v_wh;
    -- عدّ جديد يستبدل العدّ المعلّق السابق لنفس الصنف والمستودع
    UPDATE public.stock_count_entries SET status = 'superseded', reviewed_at = now()
     WHERE product_id = p.id AND warehouse_id = v_wh AND status = 'pending';
    INSERT INTO public.stock_count_entries(user_id, employee_id, branch_id, warehouse_id, product_id, system_qty, counted_qty, employee_note)
    VALUES (v_owner, v_emp, (ctx->>'branch_id')::uuid, v_wh, p.id, COALESCE(v_qty,0), p_counted_qty, NULLIF(btrim(p_note),''));
    v_changed := v_changed + 1;
  END IF;
  RETURN jsonb_build_object('changed', v_changed);
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_review(p_entry_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_cur numeric; v_delta numeric; v_cost numeric;
BEGIN
  SELECT * INTO r FROM public.stock_count_entries WHERE id = p_entry_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'السجل غير موجود'; END IF;
  IF NOT (auth.uid() = r.user_id OR (public.is_team_member(auth.uid(), r.user_id) AND (
      public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant_senior') OR public.has_role(auth.uid(),'accountant_purchases')))) THEN
    RAISE EXCEPTION 'لا تملك صلاحية اعتماد الجرد' USING ERRCODE = '42501';
  END IF;
  IF NOT public.accountant_perm('can_manage_inventory') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل كميات المخزون' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'هذا الجرد تمت مراجعته مسبقًا'; END IF;

  IF NOT p_approve THEN
    UPDATE public.stock_count_entries SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), review_note=p_note WHERE id=r.id;
    RETURN jsonb_build_object('status','rejected');
  END IF;

  -- الفرق يُحسب لحظة الاعتماد حتى تُحتسب المبيعات التي تمت بعد العدّ
  SELECT COALESCE(quantity_on_hand,0) INTO v_cur FROM public.product_warehouse_balances
   WHERE product_id = r.product_id AND warehouse_id = r.warehouse_id;
  v_delta := r.counted_qty - COALESCE(v_cur,0);
  IF v_delta <> 0 THEN
    SELECT COALESCE(buy_price,0) INTO v_cost FROM public.products WHERE id = r.product_id;
    INSERT INTO public.stock_movements(user_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, reference_note, unit_cost)
    VALUES (r.user_id, r.product_id, r.warehouse_id,
      (CASE WHEN v_delta > 0 THEN 'وارد' ELSE 'صادر' END)::stock_movement_type,
      abs(v_delta), 'stock_count', r.id, 'تسوية جرد موظف', v_cost);
  END IF;
  UPDATE public.stock_count_entries SET status='approved', reviewed_by=auth.uid(), reviewed_at=now(), review_note=p_note, applied_delta=v_delta WHERE id=r.id;
  RETURN jsonb_build_object('status','approved','delta',v_delta);
END $$;

REVOKE ALL ON FUNCTION public.stock_count_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_count_lookup(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_count_submit(uuid,text,numeric,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_count_review(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_lookup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_submit(uuid,text,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_review(uuid,boolean,text) TO authenticated;