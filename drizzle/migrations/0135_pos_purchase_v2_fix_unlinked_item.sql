CREATE OR REPLACE FUNCTION public.pos_record_purchase_v2(p_data_owner uuid, p_session_id uuid, p_supplier_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric, p_payment_type text, p_affect_inventory boolean, p_notes text, p_idempotency_key text, p_product_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sup record; v_prod_name text; v_prod_unit text; v_prod_id uuid; v_sess record;
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
    SELECT id, name, unit INTO v_prod_id, v_prod_name, v_prod_unit FROM public.products WHERE id = p_product_id AND user_id = p_data_owner;
    IF v_prod_id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
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
  v_line_name := COALESCE(v_prod_name, NULLIF(btrim(COALESCE(p_product_name,'')),''), 'مشتريات نقطة البيع');

  SELECT id INTO v_wh FROM public.warehouses
   WHERE user_id = p_data_owner AND COALESCE(is_active,true) AND (branch_id = v_sess.branch_id OR branch_id IS NULL)
   ORDER BY (branch_id = v_sess.branch_id) DESC NULLS LAST, is_default DESC NULLS LAST LIMIT 1;

  INSERT INTO public.invoices (user_id, invoice_type, contact_id, contact_name, invoice_date, due_date, subtotal, discount_amount, tax_amount,
    total_amount, paid_amount, remaining_amount, payment_status, payment_method, currency, notes, source, status, warehouse_id, cash_account_code, exchange_rate)
  VALUES (p_data_owner, 'purchase', p_supplier_id, v_sup.contact_name, v_date, v_date, v_total, 0, 0,
    v_total, 0, v_total, 'unpaid', CASE WHEN p_payment_type='cash' THEN 'نقدي' ELSE 'آجل' END, 'شيكل',
    NULLIF(btrim(COALESCE(p_notes,'')),''), 'pos', 'sent', v_wh, v_cash, 1)
  RETURNING id, invoice_number INTO v_inv_id, v_inv_no;

  INSERT INTO public.invoice_items (invoice_id, product_id, product_name, description, quantity, unit_price, discount, tax_rate, total_amount, unit_of_measure)
  VALUES (v_inv_id, CASE WHEN COALESCE(p_affect_inventory,false) THEN p_product_id ELSE NULL END, v_line_name, v_line_name,
    p_quantity, p_unit_price, 0, 0, v_total, v_prod_unit);

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
END $function$;