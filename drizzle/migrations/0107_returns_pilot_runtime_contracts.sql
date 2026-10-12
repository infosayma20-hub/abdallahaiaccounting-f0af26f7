DO $patch$
DECLARE v text;
BEGIN
 SELECT pg_get_functiondef('public.save_return_command_v1(uuid,text,jsonb,jsonb,uuid,integer,boolean)'::regprocedure) INTO v;
 IF position('a record;' IN v)=0 OR position('SELECT product_type INTO a ' IN v)=0 THEN RAISE EXCEPTION 'Unexpected returns function contract'; END IF;
 v:=replace(v,'a record;','v_product_record record;');
 v:=replace(v,'SELECT product_type INTO a ','SELECT product_type INTO v_product_record ');
 v:=replace(v,'a.product_type','v_product_record.product_type');
 v:=replace(v,'''input'' END,''taxable'',','''input'' END,''standard'',');
 EXECUTE v;
 SELECT pg_get_functiondef('public.returns_managed_stock_v1(uuid,boolean)'::regprocedure) INTO v;
 IF position('INSERT INTO public.stock_movements' IN v)=0 THEN RAISE EXCEPTION 'Unexpected managed stock function'; END IF;
 v:=replace(v,'   END IF;
   INSERT INTO public.stock_movements','   END IF;
   IF v_is_sales AND v_cost IS NULL AND EXISTS(SELECT 1 FROM public.company_settings s WHERE s.user_id=r.user_id AND s.costing_engine_enabled AND s.inventory_system=''perpetual'') THEN RAISE EXCEPTION ''اربط مردود البضاعة بفاتورة البيع الأصلية للتحقق من التكلفة''; END IF;
   INSERT INTO public.stock_movements');
 EXECUTE v;
END $patch$;