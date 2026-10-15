ALTER TABLE public.pos_purchases ADD COLUMN IF NOT EXISTS debit_account_code text;

CREATE OR REPLACE FUNCTION public.pos_shift_edit_purchase_v1(p_purchase_id uuid, p_supplier_id uuid, p_quantity numeric, p_unit_price numeric, p_debit_account_code text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pu record; t record; v_cnt int; v_tx uuid; v_rev uuid; v_new uuid; v_sup record; v_prod text;
        v_total numeric; v_debit text; v_credit text; v_sm record; v_diff numeric;
BEGIN
  SELECT * INTO pu FROM public.pos_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF pu.id IS NULL THEN RAISE EXCEPTION 'المشتريات غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(pu.shift_id, 'cancel_cash_out', p_reason);
  IF pu.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'المشتريات ملغاة'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_unit_price IS NULL OR p_unit_price <= 0 THEN RAISE EXCEPTION 'أدخل الكمية وسعر الوحدة'; END IF;

  SELECT id, contact_name, linked_account_code INTO v_sup FROM public.contacts WHERE id = COALESCE(p_supplier_id, pu.supplier_id) AND user_id = pu.user_id;
  IF v_sup.id IS NULL THEN RAISE EXCEPTION 'المورد غير موجود'; END IF;

  SELECT count(*), min(id::text)::uuid INTO v_cnt, v_tx FROM public.transactions x
   WHERE x.user_id = pu.user_id AND x.reference = 'PUR-POS-' || left(pu.id::text, 8)
     AND x.transaction_type IN ('purchase_cash','purchase_credit') AND COALESCE(x.is_deleted,false) = false
     AND NOT EXISTS (SELECT 1 FROM public.transactions r WHERE r.reversed_by_id = x.id AND r.transaction_type = 'reversal' AND COALESCE(r.is_deleted,false) = false);
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'لم يُعثر على قيد واحد فعّال لهذه المشتريات (%)', v_cnt; END IF;
  SELECT * INTO t FROM public.transactions WHERE id = v_tx;

  v_debit := COALESCE(NULLIF(btrim(p_debit_account_code),''), t.debit_account_code);
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = pu.user_id AND account_code = v_debit AND COALESCE(is_active,true)) THEN
    RAISE EXCEPTION 'الحساب % غير موجود', v_debit; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = pu.user_id AND parent_code = v_debit) THEN
    RAISE EXCEPTION 'لا يجوز الترحيل على حساب رئيسي (%)', v_debit; END IF;
  IF pu.payment_type = 'cash' THEN v_credit := t.credit_account_code;
  ELSE v_credit := v_sup.linked_account_code;
    IF COALESCE(v_credit,'') = '' THEN RAISE EXCEPTION 'المورد غير مربوط بحساب ذمة'; END IF;
  END IF;

  v_total := round(p_quantity * p_unit_price, 2);
  IF v_total = pu.total_amount AND v_debit = t.debit_account_code AND v_sup.id = pu.supplier_id AND p_quantity = pu.quantity THEN
    RAISE EXCEPTION 'لا يوجد أي تغيير'; END IF;
  SELECT name INTO v_prod FROM public.products WHERE id = pu.product_id;

  v_rev := public.create_reverse_entry(v_tx, 'تعديل مشتريات نقطة البيع (عكس): ' || btrim(p_reason), auth.uid())::uuid;
  INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code, amount, currency,
    transaction_type, contact_id, reference, payment_method)
  VALUES (pu.user_id, t.transaction_date, 'مشتريات - ' || v_sup.contact_name || COALESCE(' - ' || v_prod, '') || ' [تعديل محاسب]',
    v_debit, v_credit, v_total, 'شيكل', t.transaction_type, v_sup.id, t.reference, t.payment_method)
  RETURNING id INTO v_new;

  v_diff := p_quantity - pu.quantity;
  IF v_diff <> 0 THEN
    SELECT * INTO v_sm FROM public.stock_movements WHERE reference_type = 'pos_purchase_in' AND reference_id = pu.id LIMIT 1;
    IF v_sm.id IS NOT NULL THEN
      INSERT INTO public.stock_movements (user_id, product_id, quantity, movement_type, reference_type, reference_id, reference_note, warehouse_id, unit_cost)
      VALUES (v_sm.user_id, v_sm.product_id, abs(v_diff), CASE WHEN v_diff > 0 THEN 'وارد' ELSE 'صادر' END::stock_movement_type,
              'pos_purchase_edit', pu.id, 'تعديل كمية مشتريات الكاشير', v_sm.warehouse_id, p_unit_price);
    END IF;
  END IF;

  UPDATE public.pos_purchases SET supplier_id = v_sup.id, quantity = p_quantity, unit_price = p_unit_price,
         total_amount = v_total, debit_account_code = v_debit WHERE id = pu.id;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (pu.shift_id, 'pos_purchases', pu.id, 'purchase_edit',
    to_jsonb(pu) || jsonb_build_object('debit_account_code', t.debit_account_code),
    jsonb_build_object('supplier_id', v_sup.id, 'quantity', p_quantity, 'unit_price', p_unit_price, 'total_amount', v_total,
      'debit_account_code', v_debit, 'reversal_transaction_id', v_rev, 'transaction_id', v_new), btrim(p_reason), auth.uid());
  RETURN jsonb_build_object('ok', true, 'transaction_id', v_new, 'reversal_transaction_id', v_rev);
END $$;
REVOKE ALL ON FUNCTION public.pos_shift_edit_purchase_v1(uuid,uuid,numeric,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_edit_purchase_v1(uuid,uuid,numeric,numeric,text,text) TO authenticated;