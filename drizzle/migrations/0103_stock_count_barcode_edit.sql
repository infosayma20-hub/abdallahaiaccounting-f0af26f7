CREATE OR REPLACE FUNCTION public.stock_count_barcodes(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ctx jsonb; v_owner uuid; v_primary text; v_res jsonb;
BEGIN
  ctx := public.stock_count_context();
  SELECT user_id INTO v_owner FROM public.employees WHERE id = (ctx->>'employee_id')::uuid;
  SELECT nullif(btrim(barcode),'') INTO v_primary FROM public.products WHERE id = p_product_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'primary', is_primary) ORDER BY is_primary DESC, code), '[]'::jsonb) INTO v_res FROM (
    SELECT v_primary AS code, true AS is_primary WHERE v_primary IS NOT NULL
    UNION
    SELECT DISTINCT btrim(b.barcode), false FROM public.product_barcodes b
     WHERE b.product_id = p_product_id AND b.user_id = v_owner AND nullif(btrim(b.barcode),'') IS NOT NULL
       AND btrim(b.barcode) IS DISTINCT FROM v_primary
  ) s;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_set_barcode(p_product_id uuid, p_old text, p_new text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ctx jsonb; v_emp uuid; v_owner uuid; p record; v_old text := nullif(btrim(p_old),''); v_new text := nullif(btrim(p_new),''); v_n int := 0;
BEGIN
  ctx := public.stock_count_context();
  v_emp := (ctx->>'employee_id')::uuid;
  SELECT user_id INTO v_owner FROM public.employees WHERE id = v_emp;
  SELECT id, nullif(btrim(barcode),'') AS barcode INTO p FROM public.products WHERE id = p_product_id AND user_id = v_owner FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF v_new IS NULL THEN RAISE EXCEPTION 'اكتب الباركود الجديد'; END IF;
  IF v_new IS NOT DISTINCT FROM v_old THEN RETURN jsonb_build_object('changed', 0); END IF;

  IF v_old IS NULL AND p.barcode IS NULL THEN
    UPDATE public.products SET barcode = v_new WHERE id = p.id; v_n := 1;
  ELSIF v_old IS NOT NULL AND v_old = p.barcode THEN
    UPDATE public.products SET barcode = v_new WHERE id = p.id; v_n := 1;
    UPDATE public.product_barcodes SET barcode = v_new WHERE product_id = p.id AND user_id = v_owner AND btrim(barcode) = v_old;
  ELSIF v_old IS NOT NULL THEN
    UPDATE public.product_barcodes SET barcode = v_new WHERE product_id = p.id AND user_id = v_owner AND btrim(barcode) = v_old;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  IF v_n = 0 THEN RAISE EXCEPTION 'الباركود القديم غير موجود على هذا الصنف'; END IF;

  INSERT INTO public.product_edit_log(user_id, product_id, employee_id, changed_by, field, old_value, new_value)
  VALUES (v_owner, p.id, v_emp, auth.uid(), 'barcode', v_old, v_new);
  RETURN jsonb_build_object('changed', 1);
END $$;

REVOKE ALL ON FUNCTION public.stock_count_barcodes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_count_set_barcode(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_barcodes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_set_barcode(uuid, text, text) TO authenticated;