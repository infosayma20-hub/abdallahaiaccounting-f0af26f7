DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.pos_shift_add_sale_v1(uuid,jsonb,text,uuid,text,text,text,uuid)'::regprocedure);
 d:=replace(d,'v_rate:=coalesce(p.tax_rate,0);','v_rate:=CASE WHEN coalesce(p.is_tax_exempt,false) THEN 0 ELSE coalesce(p.tax_rate,0) END;');
 d:=replace(d,'IF length(coalesce(v_item->>''notes'',''''))>500 THEN',E'IF coalesce(v_item->>''notes'','''') LIKE ''[EMPLOYEE_HOT_DRINK]%'' THEN RAISE EXCEPTION ''ملاحظة الصنف تحتوي علامة محجوزة''; END IF;\n  IF NOT coalesce(p.is_sold,true) THEN RAISE EXCEPTION ''الصنف غير متاح للبيع''; END IF;\n  IF length(coalesce(v_item->>''notes'',''''))>500 THEN');
 d:=replace(d,'IF v_total<=0 THEN',E'IF t.branch_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE user_id=s.user_id AND branch_id=t.branch_id) THEN RAISE EXCEPTION ''فرع الوردية يحتاج مستودعًا معرّفًا لخصم الأصناف''; END IF;\n IF v_total<=0 THEN');
 EXECUTE d;
 d:=pg_get_functiondef('public.trg_pos_orders_kds_sync()'::regprocedure);
 d:=replace(d,'-- Cancellation: drop active tickets',E'IF NEW.shift_sale_request_id IS NOT NULL THEN RETURN NEW; END IF;\n  -- Cancellation: drop active tickets'); EXECUTE d;
 d:=pg_get_functiondef('public.trg_pos_orders_kds_sync_ins()'::regprocedure);
 d:=replace(d,'IF NEW.state IN',E'IF NEW.shift_sale_request_id IS NOT NULL THEN RETURN NEW; END IF;\n  IF NEW.state IN'); EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public._shift_sale_ops_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.pos_orders; s public.pos_sessions;
BEGIN
 IF NEW.action<>'sale_add' THEN RETURN NEW; END IF;
 SELECT * INTO o FROM public.pos_orders WHERE id=NEW.entity_id;
 SELECT * INTO s FROM public.pos_sessions WHERE id=NEW.session_id;
 PERFORM public.notify_ops_alert(o.user_id,'pos_shift_sale_add','إضافة فاتورة مبيعات بعد إغلاق الوردية','الفاتورة: '||coalesce(o.order_number,'')||' · المبلغ: '||o.total||' شيكل · الكاشير: '||coalesce(s.cashier_name,'غير محدد')||' · السبب: '||NEW.reason,'/pos-reports',o.id::text);
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
CREATE TRIGGER trg_shift_sale_ops_alert AFTER INSERT ON public.pos_shift_post_close_edits FOR EACH ROW EXECUTE FUNCTION public._shift_sale_ops_alert();