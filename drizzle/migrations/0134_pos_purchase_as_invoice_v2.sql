ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS pos_purchase_as_invoice boolean NOT NULL DEFAULT false;
ALTER TABLE public.pos_purchases ADD COLUMN IF NOT EXISTS invoice_id uuid;
ALTER TABLE public.pos_purchases ADD COLUMN IF NOT EXISTS voucher_number text;
CREATE INDEX IF NOT EXISTS idx_pos_purchases_invoice_id ON public.pos_purchases(invoice_id) WHERE invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pos_purchase_as_invoice_enabled(p_data_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT pos_purchase_as_invoice FROM public.company_settings WHERE user_id = p_data_owner LIMIT 1), false)
$$;
GRANT EXECUTE ON FUNCTION public.pos_purchase_as_invoice_enabled(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_record_purchase_v2(p_data_owner uuid, p_session_id uuid, p_supplier_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_payment_type text, p_affect_inventory boolean, p_notes text, p_idempotency_key text, p_product_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sup record; v_prod record; v_sess record;
  v_total numeric; v_cash text; v_sup_acc text;
  v_purchase_id uuid; v_inv_id uuid; v_inv_no text; v_tx_id uuid; v_wh uuid;
  v_existing record; v_date date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  v_line_name text; v_sync jsonb;
BEGIN
  PERFORM public.assert_owner_scope(p_data_owner);
  IF NOT public.pos_purchase_as_invoice_enabled(p_data_owner) THEN RAISE EXCEPTION 'الميزة غير مفعلة لهذه الشركة'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_unit_price IS NULL OR p_unit_price <= 0 THEN RAISE EXCEPTION 'أدخل الكمية وسعر الوحدة'; END IF;
  IF p_payment_type NOT IN ('cash','credit') THEN RAISE EXCEPTION 'طريقة دفع غير صحيحة'; END IF;
  IF NOT public._pos_purchase_perm(p_data_owner, 'can_record_purchases') THEN RAISE EXCEPTION 'ليس لديك صلاحية تسجيل مشتريات'; END IF;
  IF p_payment_type = 'cash' AND NOT public._pos_purchase_perm(p_data_owner, 'can_pay_purchases_cash') THEN RAISE EXCEPTION 'ليس لديك صلاحية الدفع نقداً من الصندوق'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT pp.id, pp.invoice_id, pp.total_amount INTO v_existing FROM public.transactions t
      JOIN public.invoices i ON i.linked_transaction_id = t.id
      JOIN public.pos_purchases pp ON pp.invoice_id = i.id
     WHERE t.user_id = p_data_owner AND t.idempotency_key = 'POSPUR-' || p_idempotency_key LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('purchase_id', v_existing.id, 'invoice_id', v_existing.invoice_id, 'total', v_existing.total_amount, 'duplicate', true);
    END IF;
  END IF;

  SELECT id, contact_name, contact_type INTO v_sup FROM public.contacts WHERE id = p_supplier_id AND user_id = p_data_owner;
  IF v_sup.id IS NULL THEN RAISE EXCEPTION 'المورد غير موجود'; END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT id, name, unit, product_type INTO v_prod FROM public.products WHERE id = p_product_id AND user_id = p_data_owner;
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  END IF;
  IF COALESCE(p_affect_inventory,false) THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'اختر الصنف لإضافته للمخزون'; END IF;
    IF NOT public._pos_purchase_perm(p_data_owner, 'can_affect_inventory_on_purchase') THEN RAISE EXCEPTION 'ليس لديك صلاحية ربط المشتريات بالمخزون'; END IF;
    IF public._inv_cost_mode(p_data_owner) = 'perpetual' THEN RAISE EXCEPTION 'الشركة على الجرد المستمر — أدخل البضاعة عبر فاتورة مشتريات أو الاستلام'; END IF;
  END IF;

  SELECT id, cash_box_id, branch_id, closed_at INTO v_sess FROM public.pos_sessions WHERE id = p_session_id AND user_id = p_data_owner;
  IF v_sess.id IS NULL THEN RAISE EXCEPTION 'لا توجد وردية مفتوحة'; END IF;
  IF v_sess.closed_at IS NOT NULL THEN RAISE EXCEPTION 'الوردية مغلقة'; END IF;

  IF p_payment_type = 'cash' THEN
    SELECT gl_account_code INTO v_cash FROM public.cash_boxes WHERE id = v_sess.cash_box_id AND user_id = p_data_owner;
    IF v_cash IS NULL THEN RAISE EXCEPTION 'صندوق الوردية غير مربوط بحساب في شجرة الحسابات'; END IF;
    PERFORM public._fc_validate_postable_account(p_data_owner, v_cash);
  END IF;
  v_sup_acc := public.resolve_postable_account(p_data_owner, '2110', p_supplier_id, v_sup.contact_name, v_sup.contact_type);
  PERFORM public._fc_validate_postable_account(p_data_owner, v_sup_acc);
  PERFORM public._fc_validate_postable_account(p_data_owner, '5110');

  v_total := round(p_quantity * p_unit_price, 2);
  v_line_name := COALESCE(v_prod.name, NULLIF(btrim(COALESCE(p_product_name,'')),''), 'مشتريات نقطة البيع');

  SELECT id INTO v_wh FROM public.warehouses
   WHERE user_id = p_data_owner AND COALESCE(is_active,true) AND (branch_id = v_sess.branch_id OR branch_id IS NULL)
   ORDER BY (branch_id = v_sess.branch_id) DESC NULLS LAST, is_default DESC NULLS LAST LIMIT 1;

  INSERT INTO public.invoices (user_id, invoice_type, contact_id, contact_name, invoice_date, due_date, subtotal, discount_amount, tax_amount,
    total_amount, paid_amount, remaining_amount, payment_status, payment_method, currency, notes, source, status, warehouse_id, cash_account_code, exchange_rate)
  VALUES (p_data_owner, 'purchase', p_supplier_id, v_sup.contact_name, v_date, v_date, v_total, 0, 0,
    v_total, 0, v_total, 'unpaid', CASE WHEN p_payment_type='cash' THEN 'نقدي' ELSE 'آجل' END, 'شيكل',
    NULLIF(btrim(COALESCE(p_notes,'')),''), 'pos', 'sent', v_wh, v_cash, 1)
  RETURNING id, invoice_number INTO v_inv_id, v_inv_no;

  -- السطر: الصنف يُربط للمخزون فقط إذا اختار الكاشير الإضافة للمخزون
  INSERT INTO public.invoice_items (invoice_id, product_id, product_name, description, quantity, unit_price, discount, tax_rate, total_amount, unit_of_measure)
  VALUES (v_inv_id, CASE WHEN COALESCE(p_affect_inventory,false) THEN p_product_id ELSE NULL END, v_line_name, v_line_name,
    p_quantity, p_unit_price, 0, 0, v_total, v_prod.unit);

  INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code, amount, currency,
    transaction_type, contact_id, reference, payment_method, idempotency_key)
  VALUES (p_data_owner, v_date, 'فاتورة مشتريات ' || v_inv_no || ' - ' || v_sup.contact_name || ' (نقطة البيع)', '5110', v_sup_acc, v_total, 'شيكل',
    'purchase_credit', p_supplier_id, v_inv_no, CASE WHEN p_payment_type='cash' THEN 'نقدي' ELSE 'آجل' END,
    COALESCE('POSPUR-' || p_idempotency_key, 'INV-' || v_inv_id::text))
  RETURNING id INTO v_tx_id;
  UPDATE public.invoices SET linked_transaction_id = v_tx_id WHERE id = v_inv_id;

  INSERT INTO public.pos_purchases (user_id, supplier_id, product_id, quantity, unit_price, total_amount, payment_type, notes, shift_id, created_by, debit_account_code, invoice_id)
  VALUES (p_data_owner, p_supplier_id, p_product_id, p_quantity, p_unit_price, v_total, p_payment_type, NULLIF(btrim(COALESCE(p_notes,'')),''), p_session_id, auth.uid(), '5110', v_inv_id)
  RETURNING id INTO v_purchase_id;

  IF p_payment_type = 'cash' THEN
    v_sync := public.sync_cash_invoice_voucher(p_data_owner, v_inv_id, true, 'purchase', p_supplier_id, v_sup.contact_name, v_total, v_date, v_cash,
      'شيكل', NULL, v_inv_no, NULL, NULL, auth.uid());
    IF NOT COALESCE((v_sync->>'success')::boolean, false) THEN
      RAISE EXCEPTION 'تعذر إنشاء سند الصرف التلقائي: %', COALESCE(v_sync->>'error','');
    END IF;
    UPDATE public.pos_purchases SET voucher_number = v_sync->>'voucher_number' WHERE id = v_purchase_id;
  END IF;

  IF p_product_id IS NOT NULL THEN
    UPDATE public.products SET buy_price = p_unit_price,
      default_supplier_id = COALESCE(default_supplier_id, p_supplier_id)
     WHERE id = p_product_id AND user_id = p_data_owner;
  END IF;

  RETURN jsonb_build_object('purchase_id', v_purchase_id, 'invoice_id', v_inv_id, 'invoice_number', v_inv_no,
    'transaction_id', v_tx_id, 'voucher_number', v_sync->>'voucher_number', 'total', v_total);
END $$;
REVOKE ALL ON FUNCTION public.pos_record_purchase_v2(uuid,uuid,uuid,uuid,numeric,numeric,text,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_record_purchase_v2(uuid,uuid,uuid,uuid,numeric,numeric,text,boolean,text,text,text) TO authenticated;

-- مزامنة سجل الوردية مع الفاتورة عند تعديلها أو إلغائها من شاشة الفواتير
CREATE OR REPLACE FUNCTION public.tg_sync_pos_purchase_from_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM 'pos' OR NEW.invoice_type <> 'purchase' THEN RETURN NEW; END IF;
  UPDATE public.pos_purchases pp SET
    total_amount = NEW.total_amount,
    supplier_id  = COALESCE(NEW.contact_id, pp.supplier_id),
    payment_type = CASE WHEN NEW.payment_method = 'نقدي' THEN 'cash' ELSE 'credit' END,
    cancelled_at = CASE WHEN NEW.status = 'cancelled' THEN COALESCE(pp.cancelled_at, now()) ELSE pp.cancelled_at END,
    cancelled_by = CASE WHEN NEW.status = 'cancelled' THEN COALESCE(pp.cancelled_by, auth.uid()) ELSE pp.cancelled_by END,
    cancel_reason = CASE WHEN NEW.status = 'cancelled' THEN COALESCE(pp.cancel_reason, 'إلغاء من شاشة الفواتير') ELSE pp.cancel_reason END
  WHERE pp.invoice_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_97_invoice_sync_pos_purchase AFTER UPDATE OF total_amount, contact_id, payment_method, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_pos_purchase_from_invoice();

CREATE OR REPLACE FUNCTION public.tg_sync_pos_purchase_from_invoice_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.pos_purchases pp SET
    quantity = NEW.quantity, unit_price = NEW.unit_price,
    product_id = COALESCE(NEW.product_id, pp.product_id)
  WHERE pp.invoice_id = NEW.invoice_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sync_pos_purchase_item AFTER INSERT OR UPDATE OF quantity, unit_price, product_id ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_pos_purchase_from_invoice_item();

-- إلغاء من دراسة الوردية: المشتريات المرتبطة بفاتورة تُلغى بإلغاء الفاتورة نفسها (يعكس القيد والسند والمخزون)
CREATE OR REPLACE FUNCTION public.pos_shift_cancel_purchase_v1(p_purchase_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pu record; v_tx uuid; v_cnt int; v_rev uuid; v_sm record;
BEGIN
  SELECT * INTO pu FROM public.pos_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF pu.id IS NULL THEN RAISE EXCEPTION 'المشتريات غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(pu.shift_id, 'cancel_cash_out', p_reason);
  IF pu.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'المشتريات ملغاة مسبقاً'; END IF;

  IF pu.invoice_id IS NOT NULL THEN
    PERFORM set_config('app.rep_self_cancel', 'on', true);
    UPDATE public.invoices SET status = 'cancelled', is_voided = true, voided_at = now(), void_reason = btrim(p_reason)
     WHERE id = pu.invoice_id AND user_id = pu.user_id AND status <> 'cancelled';
    PERFORM set_config('app.rep_self_cancel', 'off', true);
    UPDATE public.pos_purchases SET cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason) WHERE id = pu.id;
    INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
    VALUES (pu.shift_id, 'pos_purchases', pu.id, 'purchase_cancel', to_jsonb(pu), jsonb_build_object('invoice_id', pu.invoice_id, 'cancelled_invoice', true), btrim(p_reason), auth.uid());
    RETURN jsonb_build_object('ok', true, 'invoice_id', pu.invoice_id);
  END IF;

  SELECT count(*), min(id::text)::uuid INTO v_cnt, v_tx FROM public.transactions t
   WHERE t.user_id = pu.user_id AND t.reference = 'PUR-POS-' || left(pu.id::text, 8)
     AND t.transaction_type IN ('purchase_cash','purchase_credit')
     AND COALESCE(t.is_deleted,false) = false
     AND t.contact_id IS NOT DISTINCT FROM pu.supplier_id
     AND abs(t.amount - pu.total_amount) < 0.01
     AND NOT EXISTS (SELECT 1 FROM public.transactions r WHERE r.reversed_by_id = t.id AND r.transaction_type = 'reversal' AND COALESCE(r.is_deleted,false) = false);
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'لم يُعثر على قيد واحد مطابق لهذه المشتريات (%) — لا يمكن الإلغاء من هنا', v_cnt; END IF;
  v_rev := public.create_reverse_entry(v_tx, 'إلغاء مشتريات نقطة البيع: ' || btrim(p_reason), auth.uid())::uuid;
  FOR v_sm IN SELECT * FROM public.stock_movements WHERE reference_type = 'pos_purchase_in' AND reference_id = pu.id LOOP
    INSERT INTO public.stock_movements (user_id, product_id, quantity, movement_type, reference_type, reference_id, reference_note, warehouse_id, unit_cost)
    VALUES (v_sm.user_id, v_sm.product_id, v_sm.quantity, 'صادر', 'pos_purchase_cancel', pu.id, 'إلغاء مشتريات الكاشير', v_sm.warehouse_id, v_sm.unit_cost);
  END LOOP;
  UPDATE public.pos_purchases SET cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason), reversal_transaction_id = v_rev WHERE id = pu.id;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (pu.shift_id, 'pos_purchases', pu.id, 'purchase_cancel', to_jsonb(pu), jsonb_build_object('reversal_transaction_id', v_rev, 'transaction_id', v_tx), btrim(p_reason), auth.uid());
  RETURN jsonb_build_object('ok', true, 'reversal_transaction_id', v_rev);
END $function$;