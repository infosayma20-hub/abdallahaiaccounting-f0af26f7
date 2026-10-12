CREATE OR REPLACE FUNCTION public._pos_purchase_perm(p_owner uuid, p_perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ok boolean;
BEGIN
  IF v_uid IS NULL OR p_owner IS NULL THEN RETURN false; END IF;
  IF v_uid = p_owner THEN RETURN true; END IF;
  IF NOT public.is_team_member(v_uid, p_owner) THEN RETURN false; END IF;
  IF public._pos_user_is_manager(v_uid, p_owner) THEN RETURN true; END IF;
  EXECUTE format(
    'SELECT COALESCE(bool_and(p.%I), false) FROM public.pos_users pu JOIN public.pos_user_permissions p ON p.pos_user_id = pu.id
      WHERE pu.auth_user_id = $1 AND pu.user_id = $2 AND COALESCE(pu.is_active, true)', p_perm)
  INTO v_ok USING v_uid, p_owner;
  RETURN COALESCE(v_ok, false);
END $$;

CREATE OR REPLACE FUNCTION public.pos_create_supplier_v1(p_data_owner uuid, p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(coalesce(p_name, '')); v_row record;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'اكتب اسم المورد'; END IF;
  IF NOT (public._pos_purchase_perm(p_data_owner, 'can_record_purchases') AND public._pos_purchase_perm(p_data_owner, 'can_create_supplier')) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعريف مورد جديد';
  END IF;
  SELECT id, contact_name, phone INTO v_row FROM public.contacts
   WHERE user_id = p_data_owner AND contact_type = 'مورد' AND btrim(contact_name) = v_name AND COALESCE(is_archived, false) = false LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.contacts (user_id, contact_name, contact_type, is_active)
    VALUES (p_data_owner, v_name, 'مورد', true)
    RETURNING id, contact_name, phone INTO v_row;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'contact_name', v_row.contact_name, 'phone', v_row.phone);
END $$;

CREATE OR REPLACE FUNCTION public.pos_create_purchase_product_v1(p_data_owner uuid, p_name text, p_buy_price numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := btrim(coalesce(p_name, '')); v_row record;
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'اكتب اسم الصنف'; END IF;
  IF NOT (public._pos_purchase_perm(p_data_owner, 'can_record_purchases') AND public._pos_purchase_perm(p_data_owner, 'can_create_product')) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعريف صنف جديد';
  END IF;
  SELECT id, name, buy_price, quantity, unit INTO v_row FROM public.products
   WHERE user_id = p_data_owner AND btrim(name) = v_name LIMIT 1;
  IF v_row.id IS NULL THEN
    INSERT INTO public.products (user_id, name, buy_price, is_pos_available)
    VALUES (p_data_owner, v_name, GREATEST(COALESCE(p_buy_price, 0), 0), false)
    RETURNING id, name, buy_price, quantity, unit INTO v_row;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'buy_price', v_row.buy_price, 'quantity', v_row.quantity, 'unit', v_row.unit);
END $$;

CREATE OR REPLACE FUNCTION public.pos_record_purchase_v1(
  p_data_owner uuid, p_session_id uuid, p_supplier_id uuid, p_product_id uuid,
  p_quantity numeric, p_unit_price numeric, p_payment_type text, p_affect_inventory boolean,
  p_notes text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sup record; v_prod record; v_sess record;
  v_total numeric; v_credit text; v_debit text := '5110';
  v_purchase_id uuid; v_tx_id uuid; v_wh uuid; v_existing uuid; v_desc text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_unit_price IS NULL OR p_unit_price <= 0 THEN
    RAISE EXCEPTION 'أدخل الكمية وسعر الوحدة';
  END IF;
  IF p_payment_type NOT IN ('cash', 'credit') THEN RAISE EXCEPTION 'طريقة دفع غير صحيحة'; END IF;
  IF NOT public._pos_purchase_perm(p_data_owner, 'can_record_purchases') THEN RAISE EXCEPTION 'ليس لديك صلاحية تسجيل مشتريات'; END IF;
  IF p_payment_type = 'cash' AND NOT public._pos_purchase_perm(p_data_owner, 'can_pay_purchases_cash') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية الدفع نقداً من الصندوق';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions WHERE user_id = p_data_owner AND idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('transaction_id', v_existing, 'duplicate', true); END IF;
  END IF;

  SELECT id, contact_name, linked_account_code INTO v_sup FROM public.contacts
   WHERE id = p_supplier_id AND user_id = p_data_owner;
  IF v_sup.id IS NULL THEN RAISE EXCEPTION 'المورد غير موجود'; END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT id, name INTO v_prod FROM public.products WHERE id = p_product_id AND user_id = p_data_owner;
    IF v_prod.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  END IF;

  IF COALESCE(p_affect_inventory, false) THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'اختر الصنف لإضافته للمخزون'; END IF;
    IF NOT public._pos_purchase_perm(p_data_owner, 'can_affect_inventory_on_purchase') THEN
      RAISE EXCEPTION 'ليس لديك صلاحية ربط المشتريات بالمخزون';
    END IF;
    IF public._inv_cost_mode(p_data_owner) = 'perpetual' THEN
      RAISE EXCEPTION 'الشركة على الجرد المستمر — أدخل البضاعة عبر فاتورة مشتريات أو الاستلام';
    END IF;
  END IF;

  SELECT id, cash_box_id, branch_id, closed_at INTO v_sess FROM public.pos_sessions
   WHERE id = p_session_id AND user_id = p_data_owner;
  IF v_sess.id IS NULL THEN RAISE EXCEPTION 'لا توجد وردية مفتوحة'; END IF;
  IF v_sess.closed_at IS NOT NULL THEN RAISE EXCEPTION 'الوردية مغلقة'; END IF;

  IF p_payment_type = 'cash' THEN
    SELECT gl_account_code INTO v_credit FROM public.cash_boxes WHERE id = v_sess.cash_box_id AND user_id = p_data_owner;
    IF v_credit IS NULL THEN RAISE EXCEPTION 'صندوق الوردية غير مربوط بحساب في شجرة الحسابات'; END IF;
  ELSE
    v_credit := v_sup.linked_account_code;
    IF v_credit IS NULL OR v_credit = '' THEN RAISE EXCEPTION 'المورد غير مربوط بحساب ذمة في شجرة الحسابات'; END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_data_owner AND account_code = v_debit) THEN
    RAISE EXCEPTION 'حساب المشتريات 5110 غير موجود في الشجرة';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_data_owner AND parent_code IN (v_debit, v_credit)) THEN
    RAISE EXCEPTION 'لا يجوز الترحيل على حساب رئيسي (%/%)', v_debit, v_credit;
  END IF;

  v_total := round(p_quantity * p_unit_price, 2);
  v_desc := 'مشتريات - ' || v_sup.contact_name || COALESCE(' - ' || v_prod.name, '');

  INSERT INTO public.pos_purchases (user_id, supplier_id, product_id, quantity, unit_price, total_amount, payment_type, notes, shift_id, created_by)
  VALUES (p_data_owner, p_supplier_id, p_product_id, p_quantity, p_unit_price, v_total, p_payment_type, NULLIF(btrim(COALESCE(p_notes, '')), ''), p_session_id, auth.uid())
  RETURNING id INTO v_purchase_id;

  IF COALESCE(p_affect_inventory, false) THEN
    SELECT id INTO v_wh FROM public.warehouses
     WHERE user_id = p_data_owner AND COALESCE(is_active, true) AND (branch_id = v_sess.branch_id OR branch_id IS NULL)
     ORDER BY (branch_id = v_sess.branch_id) DESC NULLS LAST, is_default DESC NULLS LAST LIMIT 1;
    INSERT INTO public.pos_inventory_movements (user_id, product_id, quantity, type, notes, shift_id, created_by)
    VALUES (p_data_owner, p_product_id, p_quantity, 'purchase_in', 'شراء من ' || v_sup.contact_name, p_session_id, auth.uid());
    INSERT INTO public.stock_movements (user_id, product_id, quantity, movement_type, reference_type, reference_id, reference_note, warehouse_id, unit_cost)
    VALUES (p_data_owner, p_product_id, p_quantity, 'وارد', 'pos_purchase_in', v_purchase_id, 'مشتريات من الكاشير - ' || v_sup.contact_name, v_wh, p_unit_price);
  END IF;

  INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code, amount, currency,
    transaction_type, contact_id, reference, payment_method, idempotency_key)
  VALUES (p_data_owner, (now() AT TIME ZONE 'Asia/Hebron')::date, v_desc, v_debit, v_credit, v_total, 'شيكل',
    CASE WHEN p_payment_type = 'cash' THEN 'purchase_cash' ELSE 'purchase_credit' END, p_supplier_id,
    'PUR-POS-' || left(v_purchase_id::text, 8), CASE WHEN p_payment_type = 'cash' THEN 'نقدي' ELSE 'آجل' END, p_idempotency_key)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('purchase_id', v_purchase_id, 'transaction_id', v_tx_id, 'total', v_total);
END $$;

REVOKE ALL ON FUNCTION public._pos_purchase_perm(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_create_supplier_v1(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_create_purchase_product_v1(uuid, text, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_record_purchase_v1(uuid, uuid, uuid, uuid, numeric, numeric, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._pos_purchase_perm(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_supplier_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_create_purchase_product_v1(uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_record_purchase_v1(uuid, uuid, uuid, uuid, numeric, numeric, text, boolean, text, text) TO authenticated;