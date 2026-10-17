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
   OR EXISTS (SELECT 1 FROM public.pos_order_lines WHERE product_id=p_product_id)
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