ALTER TABLE public.accountant_permissions ADD COLUMN IF NOT EXISTS can_pos_shift_add_sale boolean NOT NULL DEFAULT false;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS shift_sale_request_id uuid;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS shift_sale_request_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS pos_shift_sale_request_unique ON public.pos_orders(user_id,shift_sale_request_id) WHERE shift_sale_request_id IS NOT NULL;

-- Only the new audited wrapper sets an exact order context. Existing sales keep their original dates.
CREATE OR REPLACE FUNCTION public._pos_sale_posting_date(p_order_id uuid) RETURNS date
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN current_setting('app.pos_shift_sale_order',true)=p_order_id::text
 THEN nullif(current_setting('app.pos_shift_sale_date',true),'')::date ELSE CURRENT_DATE END
$$;
CREATE OR REPLACE FUNCTION public._pos_sale_paid_at(p_order_id uuid) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN current_setting('app.pos_shift_sale_order',true)=p_order_id::text
 THEN nullif(current_setting('app.pos_shift_sale_time',true),'')::timestamptz ELSE now() END
$$;
REVOKE ALL ON FUNCTION public._pos_sale_posting_date(uuid),public._pos_sale_paid_at(uuid) FROM PUBLIC,anon,authenticated;

DO $$ DECLARE d text; n text; BEGIN
 d:=pg_get_functiondef('public.complete_pos_order(uuid,uuid,jsonb,numeric)'::regprocedure);
 IF position('p_user_id, CURRENT_DATE' in d)=0 OR position('paid_at = NOW()' in d)=0 THEN RAISE EXCEPTION 'Unexpected complete_pos_order definition'; END IF;
 n:=replace(d,'CURRENT_DATE','public._pos_sale_posting_date(p_order_id)');
 n:=replace(n,'paid_at = NOW()','paid_at = public._pos_sale_paid_at(p_order_id)');
 EXECUTE n;
 d:=pg_get_functiondef('public.pos_order_before_insert()'::regprocedure);
 IF position('-- Strictly use the branch already stamped' in d)=0 THEN RAISE EXCEPTION 'Unexpected numbering definition'; END IF;
 n:=replace(d,'-- Strictly use the branch already stamped', E'IF current_setting(''app.pos_shift_sale_order'',true)=NEW.id::text THEN\n    v_business_date:=public._pos_sale_posting_date(NEW.id);\n  END IF;\n  -- Strictly use the branch already stamped');
 EXECUTE n;
 d:=pg_get_functiondef('public.pos_shift_correction_access(uuid)'::regprocedure);
 IF position('''transfer_cash'', v_admin OR' in d)=0 THEN RAISE EXCEPTION 'Unexpected shift access definition'; END IF;
 n:=replace(d,'''transfer_cash'', v_admin OR','''add_sale'', v_admin OR COALESCE(ap.can_pos_shift_add_sale,false), ''transfer_cash'', v_admin OR');
 EXECUTE n;
END $$;

CREATE OR REPLACE FUNCTION public._pos_shift_sale_stock_date() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_order uuid;
BEGIN
 IF NEW.reference_type='pos_order_line_sale' AND nullif(current_setting('app.pos_shift_sale_order',true),'') IS NOT NULL THEN
  SELECT order_id INTO v_order FROM public.pos_order_lines WHERE id=NEW.reference_id;
  IF v_order::text=current_setting('app.pos_shift_sale_order',true) THEN NEW.created_at:=public._pos_sale_paid_at(v_order); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_00_shift_sale_stock_date BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public._pos_shift_sale_stock_date();

CREATE OR REPLACE FUNCTION public.pos_shift_add_sale_v1(p_session_id uuid,p_items jsonb,p_payment_type text,p_customer_id uuid,p_customer_name text,p_notes text,p_reason text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.pos_sessions; t public.pos_terminals; c public.contacts; p public.products;
 v_order uuid:=gen_random_uuid(); v_existing public.pos_orders; v_payload jsonb; v_result jsonb;
 v_item jsonb; v_qty numeric; v_price numeric; v_pct numeric; v_rate numeric; v_sub numeric; v_discount numeric; v_line_total numeric; v_tax numeric;
 v_subtotal numeric:=0; v_total numeric:=0; v_tax_total numeric:=0; v_date date; v_time timestamptz; v_cash text; v_customer_account text; v_number text;
 v_prev_flag text; v_prev_order text; v_prev_date text; v_prev_time text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يلزم تسجيل الدخول'; END IF;
 SELECT * INTO s FROM public.pos_sessions WHERE id=p_session_id FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
 PERFORM public._pos_shift_correction_gate(s.id,'add_sale',p_reason);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'معرف الحفظ مطلوب'; END IF;
 IF p_payment_type IS NULL OR p_payment_type NOT IN ('cash','credit') THEN RAISE EXCEPTION 'اختر نقدي أو آجل'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'أضف من صنف واحد إلى 100 صنف'; END IF;
 IF length(coalesce(p_customer_name,''))>200 OR length(coalesce(p_notes,''))>2000 OR length(coalesce(p_reason,''))>2000 THEN RAISE EXCEPTION 'النص المدخل طويل'; END IF;
 v_payload:=jsonb_build_object('session',s.id,'items',p_items,'payment',p_payment_type,'customer',p_customer_id,'name',nullif(btrim(p_customer_name),''),'notes',nullif(btrim(p_notes),''),'reason',btrim(p_reason));
 PERFORM pg_advisory_xact_lock(hashtextextended(s.user_id::text||':shift-sale:'||p_request_id::text,0));
 SELECT * INTO v_existing FROM public.pos_orders WHERE user_id=s.user_id AND shift_sale_request_id=p_request_id;
 IF FOUND THEN
  IF v_existing.shift_sale_request_payload IS DISTINCT FROM v_payload OR v_existing.state<>'paid' THEN RAISE EXCEPTION 'معرف الحفظ مستخدم لفاتورة مختلفة'; END IF;
  RETURN jsonb_build_object('success',true,'duplicate',true,'order_id',v_existing.id,'order_number',v_existing.order_number,'total',v_existing.total);
 END IF;
 SELECT * INTO t FROM public.pos_terminals WHERE id=s.terminal_id AND user_id=s.user_id;
 IF t.id IS NULL OR s.company_id IS DISTINCT FROM t.company_id THEN RAISE EXCEPTION 'محطة الوردية غير صالحة'; END IF;
 IF s.cash_box_id IS NULL THEN RAISE EXCEPTION 'الوردية غير مرتبطة بصندوق كاش'; END IF;
 SELECT gl_account_code INTO v_cash FROM public.cash_boxes WHERE id=s.cash_box_id AND user_id=s.user_id AND coalesce(is_active,true) AND public._currency_label_to_code(currency)='ILS';
 IF nullif(v_cash,'') IS NULL THEN RAISE EXCEPTION 'يلزم صندوق شيكل صالح مرتبط بالوردية'; END IF;
 PERFORM public._fc_validate_postable_account(s.user_id,v_cash);
 IF p_customer_id IS NOT NULL THEN
  SELECT * INTO c FROM public.contacts WHERE id=p_customer_id AND user_id=s.user_id AND coalesce(is_active,true) AND NOT coalesce(is_archived,false) AND contact_type IN ('عميل','عميل ومورد','customer','customer_supplier') FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'الزبون غير صالح أو يتبع شركة أخرى'; END IF;
 END IF;
 IF p_payment_type='credit' THEN
  IF c.id IS NULL THEN RAISE EXCEPTION 'الفاتورة الآجلة تحتاج زبونًا معرّفًا لربط الذمة'; END IF;
  v_customer_account:=public.resolve_postable_account(s.user_id,'1130',c.id);
  PERFORM public._fc_validate_postable_account(s.user_id,v_customer_account);
 END IF;
 v_date:=coalesce(s.business_date,public.pos_business_date(s.opened_at,coalesce((SELECT pos_day_cutoff_hour FROM public.company_settings WHERE user_id=s.user_id LIMIT 1),6)));
 IF v_date IS NULL THEN RAISE EXCEPTION 'تاريخ الوردية غير موجود'; END IF;
 v_time:=(v_date+interval '12 hours') AT TIME ZONE 'Asia/Hebron';
 IF EXISTS(SELECT 1 FROM public.fiscal_periods WHERE user_id=s.user_id AND v_date BETWEEN start_date AND end_date AND status IN ('closed','locked')) THEN RAISE EXCEPTION 'الفترة المحاسبية للوردية مغلقة'; END IF;
 v_prev_flag:=coalesce(current_setting('app.pos_shift_correction',true),''); v_prev_order:=coalesce(current_setting('app.pos_shift_sale_order',true),''); v_prev_date:=coalesce(current_setting('app.pos_shift_sale_date',true),''); v_prev_time:=coalesce(current_setting('app.pos_shift_sale_time',true),'');
 PERFORM set_config('app.pos_shift_correction','on',true); PERFORM set_config('app.pos_shift_sale_order',v_order::text,true); PERFORM set_config('app.pos_shift_sale_date',v_date::text,true); PERFORM set_config('app.pos_shift_sale_time',v_time::text,true);
 INSERT INTO public.pos_orders(id,user_id,company_id,session_id,customer_id,customer_name,state,order_type,currency,notes,order_note,created_at,shift_sale_request_id,shift_sale_request_payload)
 VALUES(v_order,s.user_id,s.company_id,s.id,c.id,coalesce(c.contact_name,nullif(btrim(p_customer_name),'')),'draft','takeaway','ILS',nullif(btrim(p_notes),''),nullif(btrim(p_notes),''),v_time,p_request_id,v_payload);
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN RAISE EXCEPTION 'بيانات الصنف غير صحيحة'; END IF;
  SELECT * INTO p FROM public.products WHERE id=(v_item->>'product_id')::uuid AND user_id=s.user_id FOR SHARE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'اختر صنفًا معرّفًا من مخزون الشركة'; END IF;
  v_qty:=(v_item->>'qty')::numeric; v_price:=(v_item->>'unit_price')::numeric; v_pct:=coalesce((v_item->>'discount_pct')::numeric,0); v_rate:=coalesce(p.tax_rate,0);
  IF v_qty IS NULL OR v_price IS NULL OR v_qty::text IN ('NaN','Infinity','-Infinity') OR v_price::text IN ('NaN','Infinity','-Infinity') OR v_pct::text IN ('NaN','Infinity','-Infinity') OR v_qty<=0 OR v_qty>1000000 OR v_price<0 OR v_price>10000000 OR v_pct<0 OR v_pct>100 OR v_rate<0 OR v_rate>100 THEN RAISE EXCEPTION 'تحقق من الكمية والسعر والخصم والضريبة'; END IF;
  IF length(coalesce(v_item->>'notes',''))>500 THEN RAISE EXCEPTION 'ملاحظة الصنف طويلة'; END IF;
  v_sub:=round(v_qty*v_price,2); v_discount:=round(v_sub*v_pct/100,2); v_line_total:=v_sub-v_discount; v_tax:=round(v_line_total*v_rate/(100+v_rate),2);
  INSERT INTO public.pos_order_lines(user_id,order_id,product_id,product_name,sku,unit,qty,unit_price,discount_pct,discount_amount,tax_rate,tax_amount,subtotal,total,cost_price,notes,created_at)
  VALUES(s.user_id,v_order,p.id,p.name,p.sku,coalesce(p.unit,'قطعة'),v_qty,v_price,v_pct,v_discount,v_rate,v_tax,v_sub,v_line_total,coalesce(p.buy_price,0),nullif(btrim(v_item->>'notes'),''),v_time);
  v_subtotal:=v_subtotal+v_sub; v_total:=v_total+v_line_total; v_tax_total:=v_tax_total+v_tax;
 END LOOP;
 IF v_total<=0 THEN RAISE EXCEPTION 'إجمالي الفاتورة يجب أن يكون أكبر من صفر'; END IF;
 UPDATE public.pos_orders SET subtotal=v_subtotal,total=v_total,tax_amount=v_tax_total,payment_currency='ILS',payment_currency_amount=v_total WHERE id=v_order;
 v_result:=public.complete_pos_order(v_order,s.user_id,jsonb_build_array(jsonb_build_object('method',p_payment_type,'amount',v_total,'tendered',CASE WHEN p_payment_type='cash' THEN v_total ELSE 0 END,'change',0,'currency','ILS','exchange_rate',1)),0);
 IF NOT coalesce((v_result->>'success')::boolean,false) THEN RAISE EXCEPTION '%',coalesce(v_result->>'error','تعذر ترحيل الفاتورة'); END IF;
 -- Verify the exact new postings, without changing any posted lines or old account balances.
 IF abs(coalesce((SELECT sum(amount) FROM public.transactions WHERE pos_order_id=v_order AND transaction_type IN ('pos_sale','pos_sale_vat') AND NOT is_deleted),0)-v_total)>0.01 THEN RAISE EXCEPTION 'الأثر المحاسبي لا يطابق إجمالي الفاتورة'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE pos_order_id=v_order AND transaction_date<>v_date AND NOT is_deleted) THEN RAISE EXCEPTION 'تاريخ القيد لا يطابق الوردية'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE pos_order_id=v_order AND transaction_type IN ('pos_sale','pos_sale_vat') AND debit_account_code IS DISTINCT FROM CASE WHEN p_payment_type='cash' THEN v_cash ELSE v_customer_account END AND NOT is_deleted) THEN RAISE EXCEPTION 'حساب التحصيل لا يطابق صندوق الوردية أو ذمة الزبون'; END IF;
 PERFORM public._fc_validate_postable_account(s.user_id,a.code) FROM (SELECT debit_account_code code FROM public.transactions WHERE pos_order_id=v_order UNION SELECT credit_account_code FROM public.transactions WHERE pos_order_id=v_order) a;
 SELECT order_number INTO v_number FROM public.pos_orders WHERE id=v_order;
 UPDATE public.pos_sessions SET total_orders=coalesce(total_orders,0)+1,total_sales=coalesce(total_sales,0)+v_total,expected_cash=CASE WHEN p_payment_type='cash' THEN coalesce(expected_cash,0)+v_total ELSE expected_cash END,cash_variance=CASE WHEN p_payment_type='cash' AND cash_variance IS NOT NULL THEN cash_variance-v_total ELSE cash_variance END WHERE id=s.id;
 UPDATE public.pos_shift_audits SET expected_cash_ils=coalesce(expected_cash_ils,0)+CASE WHEN p_payment_type='cash' THEN v_total ELSE 0 END,variance_ils=CASE WHEN p_payment_type='cash' THEN variance_ils-v_total ELSE variance_ils END,variance_total_ils=CASE WHEN p_payment_type='cash' THEN variance_total_ils-v_total ELSE variance_total_ils END WHERE session_id=s.id;
 INSERT INTO public.pos_shift_post_close_edits(session_id,entity_table,entity_id,action,before_data,after_data,reason,performed_by_auth_user_id)
 VALUES(s.id,'pos_orders',v_order,'sale_add',null,jsonb_build_object('order_number',v_number,'amount',v_total,'payment_type',p_payment_type,'customer_id',c.id,'customer_name',coalesce(c.contact_name,nullif(btrim(p_customer_name),'')),'business_date',v_date,'cash_box_id',s.cash_box_id,'transaction_id',v_result->'transaction_id'),btrim(p_reason),auth.uid());
 PERFORM set_config('app.pos_shift_correction',v_prev_flag,true); PERFORM set_config('app.pos_shift_sale_order',v_prev_order,true); PERFORM set_config('app.pos_shift_sale_date',v_prev_date,true); PERFORM set_config('app.pos_shift_sale_time',v_prev_time,true);
 RETURN jsonb_build_object('success',true,'order_id',v_order,'order_number',v_number,'total',v_total,'tax',v_tax_total);
END $$;
REVOKE ALL ON FUNCTION public.pos_shift_add_sale_v1(uuid,jsonb,text,uuid,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_add_sale_v1(uuid,jsonb,text,uuid,text,text,text,uuid) TO authenticated,service_role;