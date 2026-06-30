
ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS is_refund boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refund_manager_user_id uuid;

ALTER TABLE public.pos_payments DROP CONSTRAINT IF EXISTS pos_payments_amount_positive;
ALTER TABLE public.pos_payments DROP CONSTRAINT IF EXISTS pos_payments_amount_sign_chk;
ALTER TABLE public.pos_payments
  ADD CONSTRAINT pos_payments_amount_sign_chk
  CHECK ((is_refund = false AND amount >= 0) OR (is_refund = true AND amount < 0));

CREATE OR REPLACE FUNCTION public._pos_user_is_manager(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.branch_manager_assignments bma
    JOIN public.branches b ON b.id = bma.branch_id
    WHERE bma.user_id = _user_id AND b.user_id = _company_id
  )
  OR EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.auth_user_id = _user_id
      AND e.is_manager = true
      AND (e.user_id = _company_id OR EXISTS (
        SELECT 1 FROM public.branches b2
        WHERE b2.id = e.branch_id AND b2.user_id = _company_id
      ))
  );
$$;

CREATE OR REPLACE FUNCTION public.adjust_pos_payment_manager(
  p_order_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_amount numeric,
  p_method text,
  p_currency text,
  p_exchange_rate numeric,
  p_reason text,
  p_manager_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD; v_session RECORD; v_terminal RECORD;
  v_box_gl text; v_card_bank_gl text;
  v_returns_acc text; v_credit_account text;
  v_refunded_so_far numeric;
  v_max_refundable numeric;
  v_signed_amount numeric;
  v_idempotency text; v_tx_id uuid;
  v_currency_label text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'قيمة الاسترداد يجب أن تكون أكبر من صفر');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'يرجى ذكر سبب التعديل');
  END IF;
  IF NOT public._pos_user_is_manager(p_manager_user_id, p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'هذه العملية تتطلب صلاحية مدير');
  END IF;

  SELECT * INTO v_order FROM public.pos_orders
   WHERE id = p_order_id AND user_id = p_user_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة غير موجودة');
  END IF;
  IF v_order.state <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة ليست مدفوعة');
  END IF;
  IF v_order.is_return THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن تعديل دفعة لفاتورة مرتجع');
  END IF;

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session IS NULL OR v_session.state <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الوردية غير مفتوحة');
  END IF;

  SELECT COALESCE(SUM(-amount), 0) INTO v_refunded_so_far
  FROM public.pos_payments
  WHERE order_id = p_order_id AND is_refund = true;

  v_max_refundable := v_order.total - v_refunded_so_far;
  IF p_amount > v_max_refundable + 0.001 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'قيمة الاسترداد تتجاوز المتبقي من الفاتورة (' || v_max_refundable::text || ')');
  END IF;

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = p_user_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl FROM public.cash_boxes WHERE id = v_session.cash_box_id;
  END IF;
  IF v_box_gl IS NULL AND v_session.terminal_id IS NOT NULL THEN
    SELECT cash_account_code INTO v_box_gl FROM public.pos_terminals WHERE id = v_session.terminal_id;
  END IF;
  v_box_gl := COALESCE(v_box_gl, '1110');

  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;
  v_returns_acc := COALESCE(
    (SELECT account_code FROM public.accounts WHERE user_id = p_user_id AND account_code = '4150' LIMIT 1),
    COALESCE(v_terminal.revenue_account_code, '4100')
  );

  IF p_method IN ('card','visa') THEN v_credit_account := v_card_bank_gl;
  ELSIF p_method = 'credit' THEN v_credit_account := '1130';
  ELSE v_credit_account := v_box_gl; END IF;

  v_signed_amount := -1 * p_amount;
  INSERT INTO public.pos_payments (
    user_id, order_id, payment_method, amount, tendered,
    currency, change_amount, change_currency, exchange_rate,
    is_refund, refund_reason, refund_manager_user_id, notes
  ) VALUES (
    p_user_id, p_order_id, p_method, v_signed_amount, v_signed_amount,
    COALESCE(p_currency, 'ILS'), 0, COALESCE(p_currency, 'ILS'),
    COALESCE(p_exchange_rate, 1),
    true, p_reason, p_manager_user_id,
    'استرداد جزئي (وضع المدير): ' || p_reason
  );

  UPDATE public.pos_orders
     SET total = GREATEST(total - p_amount, 0),
         updated_at = now()
   WHERE id = p_order_id;

  v_currency_label := COALESCE(p_currency, 'ILS');
  v_idempotency := 'POS-ADJ-' || p_order_id::text || '-' || gen_random_uuid()::text;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key,
    foreign_amount, exchange_rate
  ) VALUES (
    p_user_id, CURRENT_DATE,
    'استرداد جزئي على فاتورة ' || COALESCE(v_order.order_number, p_order_id::text) || ' — ' || p_reason,
    v_returns_acc, v_credit_account, p_amount,
    v_currency_label, 'pos_payment_adjustment', v_order.customer_id,
    COALESCE(v_order.order_number, p_order_id::text), p_method, v_idempotency,
    CASE WHEN v_currency_label <> 'ILS' THEN p_amount / NULLIF(p_exchange_rate, 0) ELSE NULL END,
    CASE WHEN v_currency_label <> 'ILS' THEN p_exchange_rate ELSE NULL END
  ) RETURNING id INTO v_tx_id;

  BEGIN
    INSERT INTO public.pos_sensitive_actions_log (
      company_id, action, invoice_id, session_id, notes, metadata
    ) VALUES (
      p_user_id, 'manager_payment_adjustment', p_order_id, p_session_id,
      'استرداد جزئي بقيمة ' || p_amount::text || ' ' || v_currency_label
        || ' عبر ' || p_method || ' — ' || p_reason,
      jsonb_build_object(
        'manager_user_id', p_manager_user_id,
        'amount', p_amount, 'method', p_method,
        'currency', v_currency_label, 'exchange_rate', p_exchange_rate,
        'transaction_id', v_tx_id
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'success', true, 'refunded', p_amount,
    'remaining_total', GREATEST(v_order.total - p_amount, 0),
    'transaction_id', v_tx_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_pos_payment_manager(uuid,uuid,uuid,numeric,text,text,numeric,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._pos_user_is_manager(uuid,uuid) TO authenticated;
