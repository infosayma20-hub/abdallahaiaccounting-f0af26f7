CREATE OR REPLACE FUNCTION public.pos_shift_discount_order_v1(p_order_id uuid, p_discount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record; d numeric; v_n int; pay record; v_before jsonb; v_date date; v_sess record; v_term record;
        v_box text; v_card text; v_disc_acc text; v_credit text; v_tx uuid;
BEGIN
  SELECT * INTO o FROM public.pos_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(o.session_id, 'discount_order', p_reason);
  IF o.state <> 'paid' THEN RAISE EXCEPTION 'الخصم مسموح على فاتورة مدفوعة فقط'; END IF;
  IF COALESCE(o.is_return,false) THEN RAISE EXCEPTION 'لا يمكن الخصم على فاتورة مرتجع'; END IF;
  IF EXISTS (SELECT 1 FROM public.pos_orders x WHERE x.original_order_id = o.id AND COALESCE(x.is_return,false) AND x.state = 'paid') THEN
    RAISE EXCEPTION 'الفاتورة عليها مرتجع — لا يمكن تعديل الخصم بعده';
  END IF;
  d := round(COALESCE(p_discount,0), 2);
  IF d <= 0 THEN RAISE EXCEPTION 'قيمة الخصم يجب أن تكون أكبر من صفر'; END IF;
  IF d >= COALESCE(o.total,0) THEN RAISE EXCEPTION 'الخصم أكبر من أو يساوي قيمة الفاتورة'; END IF;

  SELECT count(*) INTO v_n FROM public.pos_payments WHERE order_id = o.id AND COALESCE(is_refund,false) = false;
  IF v_n = 1 THEN
    SELECT * INTO pay FROM public.pos_payments WHERE order_id = o.id AND COALESCE(is_refund,false) = false FOR UPDATE;
  ELSE
    SELECT * INTO pay FROM public.pos_payments
     WHERE order_id = o.id AND COALESCE(is_refund,false) = false AND COALESCE(payment_method,'cash') = 'cash'
       AND COALESCE(currency,'ILS') = 'ILS' AND amount >= d
     ORDER BY amount DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'الفاتورة مقسّمة ولا يوجد جزء كاش بالشيكل يغطي الخصم'; END IF;
  IF COALESCE(pay.currency,'ILS') <> 'ILS' THEN RAISE EXCEPTION 'الخصم مدعوم على دفعات الشيكل فقط'; END IF;
  IF pay.amount < d THEN RAISE EXCEPTION 'الخصم أكبر من مبلغ الدفعة'; END IF;

  SELECT * INTO v_sess FROM public.pos_sessions WHERE id = o.session_id;
  SELECT * INTO v_term FROM public.pos_terminals WHERE id = v_sess.terminal_id;
  IF v_sess.cash_box_id IS NOT NULL THEN SELECT gl_account_code INTO v_box FROM public.cash_boxes WHERE id = v_sess.cash_box_id; END IF;
  v_box := COALESCE(v_box, v_term.cash_account_code, '1110');
  v_disc_acc := public._pos_resolve_discount_acc(o.user_id, v_term.discount_account_code);
  IF COALESCE(v_disc_acc,'') = '' THEN RAISE EXCEPTION 'لا يوجد حساب خصم مسموح معرّف'; END IF;

  -- Credit the same account the tender was originally debited to.
  SELECT debit_account_code INTO v_credit FROM public.transactions
   WHERE pos_order_id = o.id AND transaction_type = 'pos_sale' AND COALESCE(is_deleted,false) = false
     AND COALESCE(payment_method,'cash') = COALESCE(pay.payment_method,'cash')
   ORDER BY created_at LIMIT 1;
  IF v_credit IS NULL THEN
    IF pay.payment_method = 'credit' THEN v_credit := '1130';
    ELSIF pay.payment_method = 'card' THEN
      SELECT COALESCE(ba.gl_account_code,'1120') INTO v_card FROM public.company_settings cs
        LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id WHERE cs.user_id = o.user_id;
      v_credit := COALESCE(v_card,'1120');
    ELSIF pay.payment_method = 'employee_account' THEN v_credit := '2180';
    ELSE v_credit := public._pos_resolve_cash_gl(v_sess.cash_box_id, 'ILS', v_box);
    END IF;
  END IF;
  PERFORM public._fc_validate_postable_account(o.user_id, v_disc_acc);
  PERFORM public._fc_validate_postable_account(o.user_id, v_credit);

  SELECT jsonb_build_object('total', o.total, 'discount_amount', o.discount_amount,
           'payments', COALESCE((SELECT jsonb_agg(to_jsonb(pp)) FROM public.pos_payments pp WHERE pp.order_id = o.id), '[]'::jsonb))
    INTO v_before;
  SELECT transaction_date INTO v_date FROM public.transactions
   WHERE pos_order_id = o.id AND transaction_type = 'pos_sale' AND COALESCE(is_deleted,false) = false
   ORDER BY created_at LIMIT 1;
  v_date := COALESCE(v_date, v_sess.business_date, o.created_at::date);

  PERFORM set_config('app.pos_shift_correction', 'on', true);
  UPDATE public.pos_orders SET discount_amount = COALESCE(discount_amount,0) + d, total = total - d WHERE id = o.id;
  UPDATE public.pos_payments
     SET amount = amount - d,
         change_amount = CASE WHEN tendered IS NOT NULL THEN COALESCE(change_amount,0) + d ELSE change_amount END,
         notes = btrim(COALESCE(notes,'') || ' [خصم دراسة الوردية ' || d || ']')
   WHERE id = pay.id;
  -- Adjusting entry (no deletion of posted lines): Dr sales discount / Cr tender account.
  INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id, reference, payment_method, idempotency_key, pos_order_id, notes)
  VALUES (o.user_id, v_date, 'خصم لاحق (دراسة الوردية) - POS ' || COALESCE(o.order_number,'') || ' — ' || btrim(p_reason),
      v_disc_acc, v_credit, d, 'شيكل', 'pos_sale_discount', o.customer_id, o.order_number, pay.payment_method,
      'POS-SHIFT-DISC-' || o.id::text || '-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS'), o.id, btrim(p_reason))
  RETURNING id INTO v_tx;
  PERFORM set_config('app.pos_shift_correction', 'off', true);

  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (o.session_id, 'pos_orders', o.id, 'order_discount', v_before,
          jsonb_build_object('discount', d, 'new_total', o.total - d, 'payment_id', pay.id, 'transaction_id', v_tx,
                             'debit', v_disc_acc, 'credit', v_credit), btrim(p_reason), auth.uid());
  RETURN jsonb_build_object('success', true, 'discount', d, 'new_total', o.total - d, 'transaction_id', v_tx);
END $$;