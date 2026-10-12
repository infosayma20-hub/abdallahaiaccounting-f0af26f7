ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS posting_version integer DEFAULT 0, ADD COLUMN IF NOT EXISTS revision integer DEFAULT 0, ADD COLUMN IF NOT EXISTS warehouse_id uuid, ADD COLUMN IF NOT EXISTS tax_inclusive boolean DEFAULT false, ADD COLUMN IF NOT EXISTS created_by uuid, ADD COLUMN IF NOT EXISTS updated_by uuid, ADD COLUMN IF NOT EXISTS command_key text;
ALTER TABLE public.return_items ADD COLUMN IF NOT EXISTS tax_category text DEFAULT 'taxable';
CREATE UNIQUE INDEX IF NOT EXISTS returns_command_key_v1 ON public.returns(user_id,command_key) WHERE command_key IS NOT NULL;
CREATE TABLE public.return_command_audit_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL,return_id uuid NOT NULL,actor_id uuid NOT NULL,action text NOT NULL,command_key text NOT NULL,before_snapshot jsonb,after_snapshot jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(owner_id,command_key));
GRANT SELECT ON public.return_command_audit_v1 TO authenticated;
GRANT ALL ON public.return_command_audit_v1 TO service_role;
ALTER TABLE public.return_command_audit_v1 ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.returns_can_access_v1(p_owner uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND p_owner='d8ddc6f2-d666-468f-85c3-f8845fb9c71c'::uuid AND (
 auth.uid()=p_owner OR public.has_role(auth.uid(),'super_admin'::public.app_role) OR (
 public.get_team_owner_id(auth.uid())=p_owner AND EXISTS(SELECT 1 FROM public.accountant_permissions ap WHERE ap.user_id=p_owner AND ap.accountant_auth_id=auth.uid() AND ap.is_active AND ap.can_process_returns)
 ));
$$;
REVOKE ALL ON FUNCTION public.returns_can_access_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.returns_can_access_v1(uuid) TO authenticated,service_role;
CREATE POLICY return_audit_read_v1 ON public.return_command_audit_v1 FOR SELECT TO authenticated USING(public.returns_can_access_v1(owner_id));
CREATE POLICY returns_pilot_read_v1 ON public.returns FOR SELECT TO authenticated USING(public.returns_can_access_v1(user_id));
CREATE POLICY return_items_pilot_read_v1 ON public.return_items FOR SELECT TO authenticated USING(public.returns_can_access_v1(user_id));
CREATE OR REPLACE FUNCTION public.returns_validate_account_v1(p_owner uuid,p_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.user_id=p_owner AND a.account_code=p_code AND COALESCE(a.is_active,true) AND COALESCE(a.currency,'شيكل') IN ('شيكل','ILS','₪') AND NOT EXISTS(SELECT 1 FROM public.accounts c WHERE c.user_id=p_owner AND c.parent_code=a.account_code)) THEN RAISE EXCEPTION 'الحساب غير موجود أو رئيسي أو غير فعال أو عملته ليست الشيكل: %',p_code; END IF;
 PERFORM public._fc_validate_postable_account(p_owner,p_code);
END $$;
REVOKE ALL ON FUNCTION public.returns_validate_account_v1(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.returns_validate_account_v1(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.returns_guard_period_v1(p_owner uuid,p_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_date IS NULL THEN RAISE EXCEPTION 'التاريخ مطلوب'; END IF;
 PERFORM 1 FROM public.fiscal_periods WHERE user_id=p_owner AND p_date BETWEEN start_date AND end_date FOR SHARE;
 IF EXISTS(SELECT 1 FROM public.fiscal_periods WHERE user_id=p_owner AND p_date BETWEEN start_date AND end_date AND status IN ('closed','locked')) THEN RAISE EXCEPTION 'الفترة المحاسبية مغلقة'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.returns_guard_period_v1(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.returns_guard_period_v1(uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.returns_guard_write_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner uuid;
BEGIN
 v_owner:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 IF v_owner='d8ddc6f2-d666-468f-85c3-f8845fb9c71c'::uuid AND COALESCE(current_setting('app.returns_command_v1',true),'')<>'on' THEN RAISE EXCEPTION 'احفظ المردود من المسار الآمن الجديد'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.returns_guard_write_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER returns_command_write_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.returns_guard_write_v1();
CREATE TRIGGER return_items_command_write_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.return_items FOR EACH ROW EXECUTE FUNCTION public.returns_guard_write_v1();
CREATE OR REPLACE FUNCTION public.returns_managed_stock_v1(p_return uuid,p_in boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.returns%ROWTYPE; it record; mv record; ce record; v_cost numeric; v_gl uuid; v_wh uuid; v_is_sales boolean;
BEGIN
 SELECT * INTO STRICT r FROM public.returns WHERE id=p_return AND posting_version=1;
 IF NOT public.returns_can_access_v1(r.user_id) OR COALESCE(current_setting('app.returns_command_v1',true),'')<>'on' THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 v_is_sales:=r.return_type='sales';
 IF p_in THEN
  FOR it IN SELECT ri.*,p.product_type FROM public.return_items ri JOIN public.products p ON p.id=ri.product_id AND p.user_id=r.user_id WHERE ri.return_id=r.id AND COALESCE(p.product_type,'')<>'service' ORDER BY ri.product_id,ri.id LOOP
   v_cost:=NULL;
   IF v_is_sales AND it.source_invoice_item_id IS NOT NULL THEN
    SELECT NULLIF(ii.cost_price,0) INTO v_cost FROM public.invoice_items ii WHERE ii.id=it.source_invoice_item_id;
    IF v_cost IS NULL AND EXISTS(SELECT 1 FROM public.company_settings s WHERE s.user_id=r.user_id AND s.costing_engine_enabled AND s.inventory_system='perpetual') THEN RAISE EXCEPTION 'تكلفة البيع الأصلية غير متاحة؛ يلزم مراجعة الصنف قبل ترحيل مردوده'; END IF;
   END IF;
   INSERT INTO public.stock_movements(user_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,reference_line_id,reference_note,notes,created_at)
   VALUES(r.user_id,it.product_id,r.warehouse_id,(CASE WHEN v_is_sales THEN 'وارد' ELSE 'صادر' END)::public.stock_movement_type,it.quantity,v_cost,CASE WHEN v_is_sales THEN 'sales_return' ELSE 'purchase_return' END,r.id,it.id,'مردود '||r.return_number,'[RETURN_COMMAND_V1] revision='||r.revision,(r.return_date::timestamp AT TIME ZONE 'Asia/Hebron'));
  END LOOP;
 ELSE
  FOR mv IN SELECT sm.* FROM public.stock_movements sm WHERE sm.reference_id=r.id AND sm.reference_type IN ('sales_return','purchase_return') AND sm.notes LIKE '[RETURN_COMMAND_V1]%' AND EXISTS(SELECT 1 FROM public.return_items ri WHERE ri.id=sm.reference_line_id AND ri.return_id=r.id) ORDER BY sm.product_id,sm.id LOOP
   IF EXISTS(SELECT 1 FROM public.stock_movements c WHERE c.reference_type IN ('sales_return_cancel','purchase_return_cancel') AND c.reference_line_id=mv.reference_line_id) THEN RAISE EXCEPTION 'تم عكس حركة هذا البند سابقًا'; END IF;
   PERFORM public._inv_cost_reverse_movement(mv.id);
   FOR ce IN SELECT id FROM public.inventory_cost_entries WHERE movement_id=mv.id AND entry_type='reversal' LOOP PERFORM public._inv_cost_post_gl(ce.id); END LOOP;
   INSERT INTO public.stock_movements(user_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,reference_line_id,reference_note,notes)
   VALUES(r.user_id,mv.product_id,mv.warehouse_id,(CASE WHEN mv.movement_type='وارد' THEN 'صادر' ELSE 'وارد' END)::public.stock_movement_type,mv.quantity,mv.unit_cost,CASE WHEN v_is_sales THEN 'sales_return_cancel' ELSE 'purchase_return_cancel' END,r.id,mv.reference_line_id,'عكس مردود '||r.return_number,'[RETURN_COMMAND_V1_CANCEL] reverse_of:'||mv.id);
  END LOOP;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.returns_managed_stock_v1(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.returns_managed_stock_v1(uuid,boolean) TO service_role;
DO $patch$
DECLARE v text;
BEGIN
 SELECT pg_get_functiondef('public.handle_returns_stock()'::regprocedure) INTO v;
 IF position('IF TG_OP <> ''UPDATE''' IN v)=0 THEN RAISE EXCEPTION 'Unexpected returns stock function'; END IF;
 v:=replace(v,'IF TG_OP <> ''UPDATE''','IF NEW.posting_version=1 THEN
 IF NEW.status=''confirmed'' AND OLD.status IS DISTINCT FROM ''confirmed'' THEN PERFORM public.returns_managed_stock_v1(NEW.id,true);
 ELSIF OLD.status=''confirmed'' AND NEW.status IS DISTINCT FROM ''confirmed'' THEN PERFORM public.returns_managed_stock_v1(NEW.id,false); END IF;
 RETURN NEW;
 END IF;
 IF TG_OP <> ''UPDATE''');
 EXECUTE v;
 SELECT pg_get_functiondef('public.tg_inventory_costing_engine()'::regprocedure) INTO v;
 IF position('SELECT costing_engine_enabled' IN v)=0 THEN RAISE EXCEPTION 'Unexpected costing function'; END IF;
 v:=replace(v,'SELECT costing_engine_enabled','IF TG_OP=''INSERT'' AND NEW.reference_type IN (''sales_return_cancel'',''purchase_return_cancel'') AND NEW.notes LIKE ''[RETURN_COMMAND_V1_CANCEL]%'' THEN RETURN NULL; END IF;
 SELECT costing_engine_enabled');
 EXECUTE v;
END $patch$;
CREATE OR REPLACE FUNCTION public.returns_reverse_finance_v1(p_return uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.returns%ROWTYPE; tx record; tax record; v_id uuid; v_date date:=(now() AT TIME ZONE 'Asia/Hebron')::date;
BEGIN
 SELECT * INTO STRICT r FROM public.returns WHERE id=p_return AND posting_version=1;
 IF NOT public.returns_can_access_v1(r.user_id) OR COALESCE(current_setting('app.returns_command_v1',true),'')<>'on' THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 PERFORM public.returns_guard_period_v1(r.user_id,r.return_date);
 PERFORM public.returns_guard_period_v1(r.user_id,v_date);
 FOR tx IN SELECT * FROM public.transactions WHERE user_id=r.user_id AND return_id=r.id AND idempotency_key LIKE 'RETURN-V1-'||r.id||'-'||r.revision||'-%' AND idempotency_key NOT LIKE '%-REV' ORDER BY id LOOP
  IF tx.reversed_by_id IS NOT NULL THEN RAISE EXCEPTION 'قيد المردود معكوس سابقًا'; END IF;
  INSERT INTO public.transactions(user_id,transaction_date,description,debit_account_code,credit_account_code,amount,currency,transaction_type,reference,contact_id,cost_center_id,return_id,idempotency_key)
  VALUES(r.user_id,v_date,'عكس: '||tx.description,tx.credit_account_code,tx.debit_account_code,tx.amount,tx.currency,'reverse_entry',tx.reference,tx.contact_id,tx.cost_center_id,r.id,tx.idempotency_key||'-REV') RETURNING id INTO v_id;
  UPDATE public.transactions SET reversed_by_id=v_id WHERE id=tx.id;
 END LOOP;
 FOR tax IN SELECT * FROM public.tax_ledger WHERE user_id=r.user_id AND reference_id=r.id AND reference_type IN ('sales_return','purchase_return') AND notes='[RETURN_COMMAND_V1] revision='||r.revision LOOP
  INSERT INTO public.tax_ledger(user_id,period_year,period_month,transaction_date,reference_type,reference_id,tax_type,tax_category,net_amount,tax_rate,tax_amount,invoice_number,party_name,notes)
  VALUES(r.user_id,extract(year FROM v_date)::integer,extract(month FROM v_date)::integer,v_date,CASE WHEN r.return_type='sales' THEN 'sales_return_cancel' ELSE 'purchase_return_cancel' END,r.id,tax.tax_type,tax.tax_category,-tax.net_amount,tax.tax_rate,-tax.tax_amount,r.return_number,r.contact_name,'[RETURN_COMMAND_V1_CANCEL] revision='||r.revision);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.returns_reverse_finance_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.returns_reverse_finance_v1(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.save_return_command_v1(p_owner uuid,p_command_key text,p_document jsonb,p_items jsonb,p_return_id uuid DEFAULT NULL,p_expected_revision integer DEFAULT NULL,p_confirm boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.returns%ROWTYPE; c public.contacts%ROWTYPE; s public.company_settings%ROWTYPE; a record; src record; j jsonb; old_snap jsonb; v_id uuid; v_type public.return_type_enum; v_date date; v_wh uuid; v_refund text; v_cash text; v_party text; v_return_code text; v_tax_code text; v_qty numeric; v_price numeric; v_discount numeric; v_rate numeric; v_net numeric; v_tax numeric; v_gross numeric:=0; v_disc numeric:=0; v_net_total numeric:=0; v_tax_total numeric:=0; v_category text; v_product uuid; v_source uuid; v_tx uuid; v_rev integer; v_before integer; v_taxable_net numeric:=0; v_completed jsonb;
BEGIN
 IF NOT public.returns_can_access_v1(p_owner) THEN RAISE EXCEPTION 'لا تملك صلاحية معالجة المردودات لهذه الشركة' USING ERRCODE='42501'; END IF;
 IF p_command_key IS NULL OR length(p_command_key)<8 OR length(p_command_key)>150 THEN RAISE EXCEPTION 'معرف العملية غير صالح'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text||':returns-v1',0));
 SELECT after_snapshot INTO v_completed FROM public.return_command_audit_v1 WHERE owner_id=p_owner AND command_key=p_command_key;
 IF FOUND THEN RETURN jsonb_build_object('success',true,'duplicate',true,'id',v_completed->'id','return_number',v_completed->'return_number','revision',v_completed->'revision'); END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_array_length(p_items)>200 THEN RAISE EXCEPTION 'أدخل من بند إلى 200 بند'; END IF;
 SELECT * INTO s FROM public.company_settings WHERE user_id=p_owner LIMIT 1;
 v_type:=(p_document->>'return_type')::public.return_type_enum;
 v_date:=(p_document->>'return_date')::date;
 v_refund:=COALESCE(p_document->>'refund_method','credit');
 IF v_refund NOT IN ('credit','cash','bank') THEN RAISE EXCEPTION 'طريقة الاسترداد غير صالحة'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=(p_document->>'contact_id')::uuid AND user_id=p_owner AND COALESCE(is_active,true) AND NOT COALESCE(is_archived,false) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'اختر جهة موجودة وفعالة في الشركة'; END IF;
 IF NOT(c.contact_type='عميل ومورد' OR (v_type='sales' AND c.contact_type='عميل') OR (v_type='purchase' AND c.contact_type='مورد')) THEN RAISE EXCEPTION 'نوع الجهة غير مطابق للمردود'; END IF;
 IF p_confirm AND NULLIF(btrim(p_document->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'سبب المردود مطلوب'; END IF;
 PERFORM public.returns_guard_period_v1(p_owner,v_date);
 IF NULLIF(p_document->>'cost_center_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers WHERE id=(p_document->>'cost_center_id')::uuid AND user_id=p_owner) THEN RAISE EXCEPTION 'مركز التكلفة ليس لهذه الشركة'; END IF;
 IF NULLIF(p_document->>'related_invoice_id','') IS NOT NULL THEN
  SELECT * INTO src FROM public.invoices WHERE id=(p_document->>'related_invoice_id')::uuid AND user_id=p_owner AND contact_id=c.id AND invoice_type IN (CASE WHEN v_type='sales' THEN 'sale' ELSE 'purchase' END,CASE WHEN v_type='sales' THEN 'sales' ELSE 'purchase' END) AND status NOT IN ('draft','cancelled','void') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة الأصلية غير صالحة أو ليست للجهة'; END IF;
 END IF;
 v_wh:=NULLIF(p_document->>'warehouse_id','')::uuid;
 IF v_wh IS NULL THEN SELECT id INTO v_wh FROM public.warehouses WHERE user_id=p_owner AND is_default ORDER BY id LIMIT 1; END IF;
 IF v_wh IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=v_wh AND user_id=p_owner) THEN RAISE EXCEPTION 'المستودع ليس لهذه الشركة'; END IF;
 IF p_return_id IS NOT NULL THEN
  SELECT * INTO r FROM public.returns WHERE id=p_return_id AND user_id=p_owner AND NOT is_deleted FOR UPDATE;
  IF NOT FOUND OR r.posting_version<>1 THEN RAISE EXCEPTION 'المردود القديم للعرض؛ لم يجتز مسار التعديل الآمن'; END IF;
  IF r.status='cancelled' THEN RAISE EXCEPTION 'المردود ملغى'; END IF;
  IF r.return_type IS DISTINCT FROM v_type THEN RAISE EXCEPTION 'لا يمكن تغيير نوع المردود'; END IF;
  IF p_expected_revision IS NULL OR r.revision<>p_expected_revision THEN RAISE EXCEPTION 'تم تعديل المستند؛ أعد تحميله'; END IF;
  old_snap:=to_jsonb(r)||jsonb_build_object('items',(SELECT COALESCE(jsonb_agg(to_jsonb(ri)),'[]') FROM public.return_items ri WHERE ri.return_id=r.id));
  v_id:=r.id; v_before:=r.revision;
 ELSE v_id:=gen_random_uuid(); v_before:=0; END IF;
 -- Validate every line before changing any existing effects.
 FOR j IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_qty:=(j->>'quantity')::numeric; v_price:=(j->>'unit_price')::numeric; v_discount:=COALESCE((j->>'discount')::numeric,0); v_rate:=COALESCE((j->>'tax_rate')::numeric,0);
  v_product:=NULLIF(j->>'product_id','')::uuid; v_source:=NULLIF(j->>'source_invoice_item_id','')::uuid;
  IF v_qty IS NULL OR v_price IS NULL OR v_qty<=0 OR v_price<0 OR v_discount<0 OR v_discount>v_qty*v_price OR v_qty::text IN ('NaN','Infinity','-Infinity') OR v_price::text IN ('NaN','Infinity','-Infinity') OR v_discount::text IN ('NaN','Infinity','-Infinity') OR v_rate::text IN ('NaN','Infinity','-Infinity') OR v_rate<0 OR v_rate>100 OR NULLIF(btrim(j->>'description'),'') IS NULL THEN RAISE EXCEPTION 'بيانات بند غير صالحة'; END IF;
  IF v_product IS NOT NULL THEN
   SELECT product_type INTO a FROM public.products WHERE id=v_product AND user_id=p_owner FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'الصنف ليس لهذه الشركة'; END IF;
   IF COALESCE(a.product_type,'')<>'service' AND v_wh IS NULL THEN RAISE EXCEPTION 'المستودع مطلوب للبضاعة'; END IF;
  END IF;
  IF v_source IS NOT NULL THEN
   SELECT ii.*,i.contact_id,i.user_id,i.invoice_type INTO src FROM public.invoice_items ii JOIN public.invoices i ON i.id=ii.invoice_id WHERE ii.id=v_source AND i.id=NULLIF(p_document->>'related_invoice_id','')::uuid AND i.user_id=p_owner AND i.contact_id=c.id FOR UPDATE OF ii;
   IF NOT FOUND OR src.product_id IS DISTINCT FROM v_product THEN RAISE EXCEPTION 'البند غير مطابق للفاتورة الأصلية'; END IF;
   IF COALESCE(s.vat_enabled,true) AND v_rate IS DISTINCT FROM COALESCE(src.tax_rate,0) THEN RAISE EXCEPTION 'ضريبة البند لا تطابق الأصل'; END IF;
   IF (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(p_items) x WHERE NULLIF(x->>'source_invoice_item_id','')::uuid=v_source)+COALESCE((SELECT sum(ri.quantity) FROM public.return_items ri JOIN public.returns rr ON rr.id=ri.return_id WHERE ri.source_invoice_item_id=v_source AND rr.status='confirmed' AND NOT rr.is_deleted AND rr.id<>v_id),0)>src.quantity THEN RAISE EXCEPTION 'الكمية تتجاوز المتبقي من الفاتورة الأصلية'; END IF;
  ELSIF NULLIF(p_document->>'related_invoice_id','') IS NOT NULL THEN RAISE EXCEPTION 'كل بند يجب أن يرتبط بالبنود الأصلية عند اختيار فاتورة';
  ELSIF v_rate NOT IN (0,COALESCE(s.vat_rate,16)) THEN RAISE EXCEPTION 'نسبة الضريبة غير مطابقة لإعداد الشركة'; END IF;
 END LOOP;
 PERFORM set_config('app.returns_command_v1','on',true);
 IF p_return_id IS NOT NULL THEN
  IF r.status='confirmed' THEN
   PERFORM public.returns_reverse_finance_v1(v_id);
   UPDATE public.returns SET status='draft' WHERE id=v_id;
  END IF;
  DELETE FROM public.return_items WHERE return_id=v_id AND user_id=p_owner;
  UPDATE public.returns SET contact_id=c.id,contact_name=c.contact_name,return_date=v_date,related_invoice_id=NULLIF(p_document->>'related_invoice_id','')::uuid,reason=p_document->>'reason',notes=p_document->>'notes',refund_method=v_refund,refund_account_code=NULLIF(p_document->>'refund_account_code',''),cost_center_id=NULLIF(p_document->>'cost_center_id','')::uuid,warehouse_id=v_wh,tax_inclusive=COALESCE((p_document->>'tax_inclusive')::boolean,false),revision=v_before+1,updated_by=auth.uid(),journal_entry_id=NULL WHERE id=v_id;
 ELSE
  INSERT INTO public.returns(id,user_id,return_type,return_number,contact_id,contact_name,return_date,related_invoice_id,reason,notes,refund_method,refund_account_code,cost_center_id,warehouse_id,tax_inclusive,status,posting_version,revision,created_by,updated_by,command_key)
  VALUES(v_id,p_owner,v_type,'',c.id,c.contact_name,v_date,NULLIF(p_document->>'related_invoice_id','')::uuid,p_document->>'reason',p_document->>'notes',v_refund,NULLIF(p_document->>'refund_account_code',''),NULLIF(p_document->>'cost_center_id','')::uuid,v_wh,COALESCE((p_document->>'tax_inclusive')::boolean,false),'draft',1,1,auth.uid(),auth.uid(),p_command_key);
 END IF;
 SELECT * INTO r FROM public.returns WHERE id=v_id; v_rev:=r.revision;
 FOR j IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_qty:=(j->>'quantity')::numeric; v_price:=(j->>'unit_price')::numeric; v_discount:=COALESCE((j->>'discount')::numeric,0); v_category:=COALESCE(j->>'tax_category','taxable');
  IF v_category NOT IN ('taxable','zero','exempt') THEN RAISE EXCEPTION 'الفئة الضريبية غير صالحة'; END IF;
  v_rate:=CASE WHEN COALESCE(s.vat_enabled,true) AND v_category='taxable' THEN COALESCE((j->>'tax_rate')::numeric,0) ELSE 0 END;
  v_net:=round((v_qty*v_price-v_discount)/CASE WHEN r.tax_inclusive THEN 1+v_rate/100 ELSE 1 END,2); v_tax:=round(v_net*v_rate/100,2);
  v_gross:=v_gross+round(v_qty*v_price/CASE WHEN r.tax_inclusive THEN 1+v_rate/100 ELSE 1 END,2); v_disc:=v_disc+round(v_discount/CASE WHEN r.tax_inclusive THEN 1+v_rate/100 ELSE 1 END,2); v_net_total:=v_net_total+v_net; v_tax_total:=v_tax_total+v_tax;
  IF v_rate>0 THEN v_taxable_net:=v_taxable_net+v_net; END IF;
  INSERT INTO public.return_items(return_id,user_id,product_id,source_invoice_item_id,description,quantity,unit_price,discount,tax_rate,tax_category,tax_amount,line_total)
  VALUES(v_id,p_owner,NULLIF(j->>'product_id','')::uuid,NULLIF(j->>'source_invoice_item_id','')::uuid,btrim(j->>'description'),v_qty,v_price,v_discount,v_rate,v_category,v_tax,v_net+v_tax);
 END LOOP;
 UPDATE public.returns SET subtotal=v_gross,discount_amount=v_disc,tax_amount=v_tax_total,total_amount=v_net_total+v_tax_total WHERE id=v_id;
 IF p_confirm THEN
  IF v_net_total+v_tax_total<=0 THEN RAISE EXCEPTION 'إجمالي المردود يجب أن يكون موجبًا'; END IF;
  IF v_refund='credit' THEN
   v_party:=public.resolve_postable_account(p_owner,CASE WHEN v_type='sales' THEN '1130' ELSE '2110' END,c.id,c.contact_name,c.contact_type);
   PERFORM public.returns_validate_account_v1(p_owner,v_party);
   IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE user_id=p_owner AND account_code=v_party AND contact_id=c.id) THEN RAISE EXCEPTION 'حساب الذمة غير مربوط بهذه الجهة'; END IF;
  ELSE
   v_party:=NULLIF(p_document->>'refund_account_code',''); PERFORM public.returns_validate_account_v1(p_owner,v_party);
   IF NOT EXISTS(WITH RECURSIVE tree AS (SELECT account_code,parent_code,system_role FROM public.accounts WHERE user_id=p_owner AND account_code=v_party UNION SELECT a.account_code,a.parent_code,a.system_role FROM public.accounts a JOIN tree t ON a.account_code=t.parent_code WHERE a.user_id=p_owner) SELECT 1 FROM tree WHERE (v_refund='cash' AND (account_code='1110' OR system_role='cash')) OR (v_refund='bank' AND (account_code='1120' OR system_role='bank'))) THEN RAISE EXCEPTION 'اختر حساب صندوق أو بنك مطابقًا لطريقة الاسترداد'; END IF;
  END IF;
  IF v_type='purchase' THEN v_return_code:=public._inv_cost_account(p_owner,'purchase_returns');
  ELSE
   SELECT account_code INTO v_return_code FROM public.accounts a WHERE a.user_id=p_owner AND COALESCE(a.is_active,true) AND (a.system_role='sales_returns' OR a.account_code IN ('4150','4400')) AND NOT EXISTS(SELECT 1 FROM public.accounts k WHERE k.user_id=p_owner AND k.parent_code=a.account_code) ORDER BY (a.system_role='sales_returns') DESC,a.account_code LIMIT 1;
  END IF;
  PERFORM public.returns_validate_account_v1(p_owner,v_return_code);
  INSERT INTO public.transactions(user_id,transaction_date,description,debit_account_code,credit_account_code,amount,currency,transaction_type,reference,contact_id,return_id,idempotency_key,cost_center_id,payment_method)
  VALUES(p_owner,v_date,CASE WHEN v_type='sales' THEN 'مردود مبيعات ' ELSE 'مردود مشتريات ' END||r.return_number,CASE WHEN v_type='sales' THEN v_return_code ELSE v_party END,CASE WHEN v_type='sales' THEN v_party ELSE v_return_code END,v_net_total,'شيكل',CASE WHEN v_type='sales' THEN 'sales_return' ELSE 'purchase_return' END,r.return_number,CASE WHEN v_refund='credit' THEN c.id ELSE NULL END,v_id,'RETURN-V1-'||v_id||'-'||v_rev||'-NET',r.cost_center_id,v_refund) RETURNING id INTO v_tx;
  IF v_tax_total>0 THEN
   v_tax_code:=CASE WHEN v_type='sales' THEN public._pos_vat_output_account(p_owner) ELSE COALESCE(NULLIF(s.vat_purchases_account,''),(SELECT NULLIF(input_tax_account_code,'') FROM public.tax_settings WHERE user_id=p_owner AND COALESCE(is_active,true) ORDER BY updated_at DESC NULLS LAST LIMIT 1),'1180') END;
   PERFORM public.returns_validate_account_v1(p_owner,v_tax_code);
   INSERT INTO public.transactions(user_id,transaction_date,description,debit_account_code,credit_account_code,amount,currency,transaction_type,reference,contact_id,return_id,idempotency_key,cost_center_id,payment_method)
   VALUES(p_owner,v_date,'عكس ضريبة مردود '||r.return_number,CASE WHEN v_type='sales' THEN v_tax_code ELSE v_party END,CASE WHEN v_type='sales' THEN v_party ELSE v_tax_code END,v_tax_total,'شيكل',CASE WHEN v_type='sales' THEN 'sales_return' ELSE 'purchase_return' END,r.return_number,CASE WHEN v_refund='credit' THEN c.id ELSE NULL END,v_id,'RETURN-V1-'||v_id||'-'||v_rev||'-VAT',r.cost_center_id,v_refund);
   INSERT INTO public.tax_ledger(user_id,period_year,period_month,transaction_date,reference_type,reference_id,tax_type,tax_category,net_amount,tax_rate,tax_amount,invoice_number,party_name,notes)
   VALUES(p_owner,extract(year FROM v_date)::integer,extract(month FROM v_date)::integer,v_date,CASE WHEN v_type='sales' THEN 'sales_return' ELSE 'purchase_return' END,v_id,CASE WHEN v_type='sales' THEN 'output' ELSE 'input' END,'taxable',-v_taxable_net,COALESCE(s.vat_rate,16),-v_tax_total,r.return_number,c.contact_name,'[RETURN_COMMAND_V1] revision='||v_rev);
  END IF;
  UPDATE public.returns SET journal_entry_id=v_tx,status='confirmed' WHERE id=v_id;
 END IF;
 SELECT to_jsonb(rr)||jsonb_build_object('items',(SELECT COALESCE(jsonb_agg(to_jsonb(ri)),'[]') FROM public.return_items ri WHERE ri.return_id=v_id)) INTO v_completed FROM public.returns rr WHERE rr.id=v_id;
 INSERT INTO public.return_command_audit_v1(owner_id,return_id,actor_id,action,command_key,before_snapshot,after_snapshot) VALUES(p_owner,v_id,auth.uid(),CASE WHEN p_confirm THEN 'confirm' ELSE 'draft' END,p_command_key,old_snap,v_completed);
 RETURN jsonb_build_object('success',true,'id',v_id,'return_number',v_completed->'return_number','revision',v_rev);
END $$;
REVOKE ALL ON FUNCTION public.save_return_command_v1(uuid,text,jsonb,jsonb,uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_return_command_v1(uuid,text,jsonb,jsonb,uuid,integer,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cancel_return_command_v1(p_owner uuid,p_return_id uuid,p_expected_revision integer,p_command_key text,p_delete_draft boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.returns%ROWTYPE; snap jsonb;
BEGIN
 IF NOT public.returns_can_access_v1(p_owner) THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 IF p_command_key IS NULL OR length(p_command_key)<8 OR length(p_command_key)>150 THEN RAISE EXCEPTION 'معرف العملية غير صالح'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text||':returns-v1',0));
 IF EXISTS(SELECT 1 FROM public.return_command_audit_v1 WHERE owner_id=p_owner AND command_key=p_command_key) THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 SELECT * INTO r FROM public.returns WHERE id=p_return_id AND user_id=p_owner AND NOT is_deleted FOR UPDATE;
 IF NOT FOUND OR r.posting_version<>1 THEN RAISE EXCEPTION 'هذا مستند قديم؛ الإلغاء الآمن غير معتمد عليه'; END IF;
 IF p_expected_revision IS NULL OR r.revision<>p_expected_revision THEN RAISE EXCEPTION 'تم تعديل المستند؛ أعد تحميله'; END IF;
 IF r.status='cancelled' THEN RETURN jsonb_build_object('success',true,'duplicate',true); END IF;
 IF p_delete_draft AND r.status<>'draft' THEN RAISE EXCEPTION 'يمكن حذف المسودة فقط'; END IF;
 PERFORM public.returns_guard_period_v1(p_owner,r.return_date);
 snap:=to_jsonb(r)||jsonb_build_object('items',(SELECT COALESCE(jsonb_agg(to_jsonb(ri)),'[]') FROM public.return_items ri WHERE ri.return_id=r.id));
 PERFORM set_config('app.returns_command_v1','on',true);
 IF r.status='confirmed' THEN PERFORM public.returns_reverse_finance_v1(r.id); END IF;
 UPDATE public.returns SET status=CASE WHEN p_delete_draft THEN status ELSE 'cancelled'::public.return_status_enum END,is_deleted=p_delete_draft,updated_by=auth.uid() WHERE id=r.id;
 INSERT INTO public.return_command_audit_v1(owner_id,return_id,actor_id,action,command_key,before_snapshot,after_snapshot) SELECT p_owner,r.id,auth.uid(),CASE WHEN p_delete_draft THEN 'delete_draft' ELSE 'cancel' END,p_command_key,snap,to_jsonb(rr) FROM public.returns rr WHERE rr.id=r.id;
 RETURN jsonb_build_object('success',true,'id',r.id);
END $$;
REVOKE ALL ON FUNCTION public.cancel_return_command_v1(uuid,uuid,integer,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_return_command_v1(uuid,uuid,integer,text,boolean) TO authenticated,service_role;