DO $patch$
DECLARE v text; old_guard text;
BEGIN
 SELECT pg_get_functiondef('public.save_return_command_v1(uuid,text,jsonb,jsonb,uuid,integer,boolean)'::regprocedure) INTO v;
 old_guard := 'IF COALESCE(s.vat_enabled,true) AND v_rate IS DISTINCT FROM COALESCE(src.tax_rate,0) THEN RAISE EXCEPTION ''ضريبة البند لا تطابق الأصل''; END IF;';
 IF position(old_guard IN v)=0 THEN RAISE EXCEPTION 'Unexpected returns VAT validation contract'; END IF;
 v := replace(v, old_guard, 'IF COALESCE(s.vat_enabled,true) AND (v_rate IS DISTINCT FROM COALESCE(src.tax_rate,0) OR (COALESCE(src.tax_rate,0)>0 AND COALESCE(j->>''tax_category'',''taxable'')<>''taxable'')) THEN RAISE EXCEPTION ''ضريبة البند لا تطابق الأصل''; END IF;');
 EXECUTE v;
END $patch$;