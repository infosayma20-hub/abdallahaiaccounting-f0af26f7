CREATE OR REPLACE FUNCTION public.stock_count_units()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; v_owner uuid; v_result jsonb;
BEGIN
 ctx := public.stock_count_context();
 SELECT user_id INTO v_owner FROM public.employees WHERE id=(ctx->>'employee_id')::uuid;
 SELECT coalesce(jsonb_agg(u ORDER BY u),'[]'::jsonb) INTO v_result FROM (
 SELECT DISTINCT btrim(unit) u FROM public.products WHERE user_id=v_owner AND nullif(btrim(unit),'') IS NOT NULL
 UNION SELECT DISTINCT btrim(unit_name) FROM public.product_units WHERE user_id=v_owner AND is_active AND nullif(btrim(unit_name),'') IS NOT NULL
 ) s;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.stock_count_units() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_units() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_count_submit_v2(p_product_id uuid, p_unit text, p_name text DEFAULT NULL, p_sell_price numeric DEFAULT NULL, p_counted_qty numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; v_owner uuid; v_old text; v_unit text := nullif(btrim(p_unit),''); v_result jsonb;
BEGIN
 ctx := public.stock_count_context();
 SELECT user_id INTO v_owner FROM public.employees WHERE id=(ctx->>'employee_id')::uuid;
 SELECT unit INTO v_old FROM public.products WHERE id=p_product_id AND user_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
 IF v_unit IS NULL OR length(v_unit)>80 THEN RAISE EXCEPTION 'أدخل وحدة صحيحة لا تتجاوز 80 حرفًا'; END IF;
 IF v_unit IS DISTINCT FROM v_old THEN
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE product_id=p_product_id)
   OR EXISTS (SELECT 1 FROM public.invoice_items WHERE product_id=p_product_id)
   OR EXISTS (SELECT 1 FROM public.pos_order_items WHERE product_id=p_product_id)
   OR EXISTS (SELECT 1 FROM public.stock_count_entries WHERE product_id=p_product_id)
   OR EXISTS (SELECT 1 FROM public.product_units WHERE product_id=p_product_id)
   OR EXISTS (SELECT 1 FROM public.product_warehouse_balances WHERE product_id=p_product_id AND coalesce(quantity_on_hand,0)<>0)
   OR EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND coalesce(quantity,0)<>0)
  THEN RAISE EXCEPTION 'لا يمكن تغيير وحدة صنف له كميات أو حركات أو وحدات تحويل؛ راجع الإدارة حفاظًا على المخزون القديم'; END IF;
  UPDATE public.products SET unit=v_unit WHERE id=p_product_id AND user_id=v_owner;
  INSERT INTO public.product_edit_log(user_id,product_id,employee_id,changed_by,field,old_value,new_value)
   VALUES(v_owner,p_product_id,(ctx->>'employee_id')::uuid,auth.uid(),'unit',v_old,v_unit);
 END IF;
 v_result := public.stock_count_submit(p_product_id,p_name,p_sell_price,p_counted_qty,p_note);
 RETURN v_result || jsonb_build_object('unit',v_unit);
END $$;
REVOKE ALL ON FUNCTION public.stock_count_submit_v2(uuid,text,text,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_submit_v2(uuid,text,text,numeric,numeric,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_count_create_product_v2(p_name text,p_sell_price numeric,p_barcodes text[],p_unit text,p_image_url text DEFAULT NULL,p_counted_qty numeric DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; v_owner uuid; v_result jsonb; v_pid uuid; v_unit text:=nullif(btrim(p_unit),''); v_old text;
BEGIN
 ctx:=public.stock_count_context();
 SELECT user_id INTO v_owner FROM public.employees WHERE id=(ctx->>'employee_id')::uuid;
 IF v_unit IS NULL OR length(v_unit)>80 THEN RAISE EXCEPTION 'أدخل وحدة صحيحة لا تتجاوز 80 حرفًا'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stock_count_barcodes:'||v_owner::text,0));
 v_result:=public.stock_count_create_product(p_name,p_sell_price,p_barcodes,p_image_url,p_counted_qty,p_note);
 v_pid:=(v_result->>'product_id')::uuid;
 SELECT unit INTO v_old FROM public.products WHERE id=v_pid AND user_id=v_owner;
 UPDATE public.products SET unit=v_unit WHERE id=v_pid AND user_id=v_owner;
 IF v_unit IS DISTINCT FROM v_old THEN
 INSERT INTO public.product_edit_log(user_id,product_id,employee_id,changed_by,field,old_value,new_value)
 VALUES(v_owner,v_pid,(ctx->>'employee_id')::uuid,auth.uid(),'unit',v_old,v_unit);
 END IF;
 RETURN v_result || jsonb_build_object('unit',v_unit);
END $$;
REVOKE ALL ON FUNCTION public.stock_count_create_product_v2(text,numeric,text[],text,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_create_product_v2(text,numeric,text[],text,text,numeric,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_count_set_barcode(p_product_id uuid,p_old text,p_new text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ctx jsonb; v_emp uuid; v_owner uuid; p record; v_old text:= (public._barcode_variants(p_old))[1]; v_new text:= (public._barcode_variants(p_new))[1]; v_n int:=0; v_other text;
BEGIN
 ctx:=public.stock_count_context(); v_emp:=(ctx->>'employee_id')::uuid;
 SELECT user_id INTO v_owner FROM public.employees WHERE id=v_emp;
 PERFORM pg_advisory_xact_lock(hashtextextended('stock_count_barcodes:'||v_owner::text,0));
 SELECT id,nullif(btrim(barcode),'') AS barcode INTO p FROM public.products WHERE id=p_product_id AND user_id=v_owner FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
 IF v_new IS NULL THEN RAISE EXCEPTION 'اكتب الباركود الجديد'; END IF;
 IF v_old IS NOT NULL AND p.barcode IS DISTINCT FROM v_old AND NOT EXISTS(SELECT 1 FROM public.product_barcodes WHERE product_id=p.id AND user_id=v_owner AND btrim(barcode)=v_old) THEN
 RAISE EXCEPTION 'الباركود القديم غير موجود على هذا الصنف'; END IF;
 IF v_old IS NOT NULL AND v_new=v_old THEN RETURN jsonb_build_object('changed',0); END IF;
 SELECT pr.name INTO v_other FROM public.products pr WHERE pr.user_id=v_owner AND pr.id<>p.id AND (
 public._barcode_variants(pr.barcode) && public._barcode_variants(v_new) OR EXISTS(SELECT 1 FROM public.product_barcodes b WHERE b.product_id=pr.id AND b.user_id=v_owner AND public._barcode_variants(b.barcode) && public._barcode_variants(v_new))) LIMIT 1;
 IF v_other IS NOT NULL THEN RAISE EXCEPTION 'الباركود مستخدم لصنف آخر: %',v_other USING ERRCODE='23505'; END IF;
 IF (v_old IS NULL OR NOT (public._barcode_variants(v_old) && public._barcode_variants(v_new))) AND (
 public._barcode_variants(p.barcode) && public._barcode_variants(v_new) OR EXISTS(SELECT 1 FROM public.product_barcodes b WHERE b.product_id=p.id AND b.user_id=v_owner AND public._barcode_variants(b.barcode) && public._barcode_variants(v_new))) THEN
 RAISE EXCEPTION 'الباركود مضاف مسبقًا لهذا الصنف' USING ERRCODE='23505'; END IF;
 IF v_old IS NULL AND p.barcode IS NULL THEN
 UPDATE public.products SET barcode=v_new WHERE id=p.id; v_n:=1;
 ELSIF v_old IS NULL THEN
 INSERT INTO public.product_barcodes(product_id,user_id,barcode,is_default) VALUES(p.id,v_owner,v_new,false); v_n:=1;
 ELSIF v_old=p.barcode THEN
 UPDATE public.products SET barcode=v_new WHERE id=p.id; v_n:=1;
 UPDATE public.product_barcodes SET barcode=v_new WHERE product_id=p.id AND user_id=v_owner AND btrim(barcode)=v_old;
 ELSE
 UPDATE public.product_barcodes SET barcode=v_new WHERE product_id=p.id AND user_id=v_owner AND btrim(barcode)=v_old;
 GET DIAGNOSTICS v_n=ROW_COUNT;
 END IF;
 IF v_n=0 THEN RAISE EXCEPTION 'الباركود القديم غير موجود على هذا الصنف'; END IF;
 INSERT INTO public.product_edit_log(user_id,product_id,employee_id,changed_by,field,old_value,new_value)
 VALUES(v_owner,p.id,v_emp,auth.uid(),'barcode',v_old,v_new);
 RETURN jsonb_build_object('changed',1);
END $$;
REVOKE ALL ON FUNCTION public.stock_count_set_barcode(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_count_set_barcode(uuid,text,text) TO authenticated, service_role;