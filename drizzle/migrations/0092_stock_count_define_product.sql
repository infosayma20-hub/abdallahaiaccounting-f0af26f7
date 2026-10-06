CREATE OR REPLACE FUNCTION public.stock_count_create_product(
  p_name text, p_sell_price numeric, p_barcodes text[], p_image_url text DEFAULT NULL,
  p_counted_qty numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb; v_emp uuid; v_owner uuid; v_wh uuid; v_bu uuid; v_pid uuid; v_code text;
  v_codes text[] := '{}'; v_first text; v_other text;
BEGIN
  ctx := public.stock_count_context();
  v_emp := (ctx->>'employee_id')::uuid;
  v_wh := nullif(ctx->>'warehouse_id','')::uuid;
  SELECT user_id INTO v_owner FROM public.employees WHERE id = v_emp;
  IF nullif(btrim(p_name),'') IS NULL THEN RAISE EXCEPTION 'اسم الصنف مطلوب'; END IF;
  IF p_sell_price IS NULL OR p_sell_price < 0 THEN RAISE EXCEPTION 'سعر البيع غير صالح'; END IF;
  IF p_counted_qty IS NOT NULL AND p_counted_qty < 0 THEN RAISE EXCEPTION 'الكمية غير صالحة'; END IF;
  IF p_image_url IS NOT NULL AND position('/company-assets/' || auth.uid()::text || '/' in p_image_url) = 0 THEN
    RAISE EXCEPTION 'رابط الصورة غير صالح';
  END IF;

  FOREACH v_code IN ARRAY coalesce(p_barcodes, '{}') LOOP
    v_code := btrim(v_code);
    IF v_code <> '' AND NOT v_code = ANY(v_codes) THEN v_codes := v_codes || v_code; END IF;
  END LOOP;
  IF array_length(v_codes,1) IS NULL THEN RAISE EXCEPTION 'أدخل باركودًا واحدًا على الأقل'; END IF;

  -- منع التكرار مع أي صنف قائم (بكل صيغ الباركود)
  FOREACH v_code IN ARRAY v_codes LOOP
    SELECT pr.name INTO v_other FROM public.products pr
     WHERE pr.user_id = v_owner AND (pr.barcode = ANY(public._barcode_variants(v_code))
       OR pr.id IN (SELECT pb.product_id FROM public.product_barcodes pb
                     WHERE pb.user_id = v_owner AND pb.barcode = ANY(public._barcode_variants(v_code))))
     LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION 'الباركود % مستخدم لصنف آخر: %', v_code, v_other USING ERRCODE = '23505';
    END IF;
  END LOOP;
  v_first := v_codes[1];

  INSERT INTO public.products(user_id, name, sell_price, barcode, image_url, is_pos_available, is_sold, source, notes)
  VALUES (v_owner, btrim(p_name), p_sell_price, v_first, p_image_url, true, true, 'stock_count',
          'عُرّف من شاشة الجرد')
  RETURNING id INTO v_pid;

  INSERT INTO public.product_barcodes(product_id, user_id, barcode, is_default)
  SELECT v_pid, v_owner, c, c = v_first FROM unnest(v_codes) c;

  -- ربط بنشاط الفرع (إن وُجد) حتى يظهر في نقطة بيع النشاط الصحيح
  SELECT business_unit_id INTO v_bu FROM public.branches WHERE id = nullif(ctx->>'branch_id','')::uuid;
  IF v_bu IS NOT NULL THEN
    INSERT INTO public.product_business_units(product_id, business_unit_id, user_id) VALUES (v_pid, v_bu, v_owner);
  END IF;

  INSERT INTO public.product_edit_log(user_id, product_id, employee_id, changed_by, field, old_value, new_value)
  VALUES (v_owner, v_pid, v_emp, auth.uid(), 'created', NULL,
          btrim(p_name) || ' | ' || p_sell_price::text || ' | ' || array_to_string(v_codes, ','));

  UPDATE public.stock_count_unknown_barcodes SET status = 'resolved'
   WHERE user_id = v_owner AND status = 'pending' AND code = ANY(v_codes);

  -- الكمية تمر بالمراجعة كالمعتاد (لا حركة مخزون قبل الاعتماد)
  IF p_counted_qty IS NOT NULL THEN
    IF v_wh IS NULL THEN RAISE EXCEPTION 'لا يوجد مستودع مربوط بفرعك — راجع الإدارة'; END IF;
    INSERT INTO public.stock_count_entries(user_id, employee_id, branch_id, warehouse_id, product_id, system_qty, counted_qty, employee_note)
    VALUES (v_owner, v_emp, nullif(ctx->>'branch_id','')::uuid, v_wh, v_pid, 0, p_counted_qty, nullif(btrim(p_note),''));
  END IF;
  RETURN jsonb_build_object('product_id', v_pid, 'barcodes', to_jsonb(v_codes));
END $$;

CREATE OR REPLACE FUNCTION public.stock_count_set_image(p_product_id uuid, p_image_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb; v_emp uuid; v_owner uuid; v_old text;
BEGIN
  ctx := public.stock_count_context();
  v_emp := (ctx->>'employee_id')::uuid;
  SELECT user_id INTO v_owner FROM public.employees WHERE id = v_emp;
  IF p_image_url IS NULL OR position('/company-assets/' || auth.uid()::text || '/' in p_image_url) = 0 THEN
    RAISE EXCEPTION 'رابط الصورة غير صالح';
  END IF;
  SELECT image_url INTO v_old FROM public.products WHERE id = p_product_id AND user_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  UPDATE public.products SET image_url = p_image_url WHERE id = p_product_id;
  INSERT INTO public.product_edit_log(user_id, product_id, employee_id, changed_by, field, old_value, new_value)
  VALUES (v_owner, p_product_id, v_emp, auth.uid(), 'image_url', v_old, p_image_url);
END $$;

REVOKE ALL ON FUNCTION public.stock_count_create_product(text,numeric,text[],text,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_count_set_image(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_create_product(text,numeric,text[],text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_count_set_image(uuid,text) TO authenticated;