CREATE OR REPLACE FUNCTION public.pos_manager_discount_order_v1(
  p_order_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric,
  p_reason text,
  p_manager_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD; v_session RECORD; v_terminal RECORD; v_pay RECORD;
  v_box_gl text; v_card_bank_gl text;
  v_disc_acc text; v_credit_account text;
  v_n int; v_d numeric; v_tx_id uuid;
  v_idempotency text; v_before jsonb;
BEGIN
  -- ── Guards ──────────────────────────────────────────────
  v_d := round(COALESCE(p_amount, 0), 2);
  IF v_d <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'قيمة الخصم يجب أن تكون أكبر من صفر');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى ذكر سبب الخصم');
  END IF;
  IF NOT public._pos_user_is_manager(p_manager_user_id, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذه العملية تتطلب صلاحية مدير');
  END IF;

  SELECT * INTO v_order FROM public.pos_orders
   WHERE id = p_order_id AND user_id = p_user_id FOR UPDATE;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة غير موجودة');
  END IF;
  IF v_order.state <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الخصم مسموح على فاتورة مدفوعة فقط');
  END IF;
  IF COALESCE(v_order.is_return, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن الخصم على فاتورة مرتجع');
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_orders x
              WHERE x.original_order_id = v_order.id
                AND COALESCE(x.is_return, false) AND x.state = 'paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة عليها مرتجع — لا يمكن الخصم بعده');
  END IF;
  IF v_d >= COALESCE(v_order.total, 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'الخصم أكبر من أو يساوي قيمة الفاتورة');
  END IF;

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session IS NULL OR v_session.state <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الوردية غير مفتوحة');
  END IF;

  -- ── Pick the payment line to reduce ─────────────────────
  SELECT count(*) INTO v_n FROM public.pos_payments
   WHERE order_id = v_order.id AND COALESCE(is_refund, false) = false;
  IF v_n = 1 THEN
    SELECT * INTO v_pay FROM public.pos_payments
     WHERE order_id = v_order.id AND COALESCE(is_refund, false) = false FOR UPDATE;
  ELSE
    SELECT * INTO v_pay FROM public.pos_payments
     WHERE order_id = v_order.id AND COALESCE(is_refund, false) = false
       AND COALESCE(payment_method, 'cash') = 'cash'
       AND COALESCE(currency, 'ILS') = 'ILS' AND amount >= v_d
     ORDER BY amount DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_pay.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة مقسّمة ولا يوجد جزء كاش بالشيكل يغطي الخصم');
  END IF;
  IF COALESCE(v_pay.currency, 'ILS') <> 'ILS' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الخصم مدعوم على دفعات الشيكل فقط');
  END IF;
  IF v_pay.amount < v_d THEN
    RETURN jsonb_build_object('success', false, 'error', 'الخصم أكبر من مبلغ الدفعة');
  END IF;

  -- ── Resolve accounts ────────────────────────────────────
  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;
  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl FROM public.cash_boxes WHERE id = v_session.cash_box_id;
  END IF;
  v_box_gl := COALESCE(v_box_gl, v_terminal.cash_account_code, '1110');

  v_disc_acc := public._pos_resolve_discount_acc(p_user_id, v_terminal.discount_account_code);
  IF COALESCE(v_disc_acc, '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يوجد حساب خصم مسموح معرّف');
  END IF;

  -- Credit the same account the tender was originally debited to.
  SELECT debit_account_code INTO v_credit_account FROM public.transactions
   WHERE pos_order_id = v_order.id AND transaction_type = 'pos_sale'
     AND COALESCE(is_deleted, false) = false
     AND COALESCE(payment_method, 'cash') = COALESCE(v_pay.payment_method, 'cash')
   ORDER BY created_at LIMIT 1;
  IF v_credit_account IS NULL THEN
    IF v_pay.payment_method = 'credit' THEN
      v_credit_account := '1130';
    ELSIF v_pay.payment_method IN ('card', 'visa') THEN
      SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
      FROM public.company_settings cs
      LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
      WHERE cs.user_id = p_user_id;
      v_credit_account := COALESCE(v_card_bank_gl, '1120');
    ELSIF v_pay.payment_method = 'employee_account' THEN
      v_credit_account := '2180';
    ELSE
      v_credit_account := public._pos_resolve_cash_gl(v_session.cash_box_id, 'ILS', v_box_gl);
    END IF;
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, v_disc_acc);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit_account);

  SELECT jsonb_build_object('total', v_order.total, 'discount_amount', v_order.discount_amount,
         'payments', COALESCE((SELECT jsonb_agg(to_jsonb(pp)) FROM public.pos_payments pp WHERE pp.order_id = v_order.id), '[]'::jsonb))
    INTO v_before;

  -- ── Apply: no deletion of posted lines, adjusting entry only ──
  UPDATE public.pos_orders
     SET discount_amount = COALESCE(discount_amount, 0) + v_d,
         total = total - v_d,
         updated_at = now()
   WHERE id = v_order.id;

  UPDATE public.pos_payments
     SET amount = amount - v_d,
         change_amount = CASE WHEN tendered IS NOT NULL THEN COALESCE(change_amount, 0) + v_d ELSE change_amount END,
         notes = btrim(COALESCE(notes, '') || ' [خصم مدير ' || v_d || ']')
   WHERE id = v_pay.id;

  v_idempotency := 'POS-MGR-DISC-' || v_order.id::text || '-' || gen_random_uuid()::text;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key, pos_order_id, notes
  ) VALUES (
    p_user_id, COALESCE(v_session.business_date, CURRENT_DATE),
    'خصم مدير بعد الدفع - POS ' || COALESCE(v_order.order_number, '') || ' — ' || btrim(p_reason),
    v_disc_acc, v_credit_account, v_d,
    'شيكل', 'pos_sale_discount', v_order.customer_id,
    v_order.order_number, v_pay.payment_method, v_idempotency,
    v_order.id, btrim(p_reason)
  ) RETURNING id INTO v_tx_id;

  BEGIN
    INSERT INTO public.pos_sensitive_actions_log (
      company_id, action, invoice_id, session_id, notes, metadata
    ) VALUES (
      p_user_id, 'manager_order_discount', v_order.id, p_session_id,
      'خصم مدير بقيمة ' || v_d::text || ' شيكل على فاتورة ' || COALESCE(v_order.order_number, '') || ' — ' || btrim(p_reason),
      jsonb_build_object(
        'manager_user_id', p_manager_user_id,
        'discount', v_d, 'new_total', v_order.total - v_d,
        'payment_id', v_pay.id, 'transaction_id', v_tx_id,
        'debit', v_disc_acc, 'credit', v_credit_account,
        'before', v_before
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'success', true, 'discount', v_d,
    'new_total', v_order.total - v_d,
    'transaction_id', v_tx_id,
    'debit_account', v_disc_acc, 'credit_account', v_credit_account
  );
END;
$function$;