
CREATE OR REPLACE FUNCTION public.resync_pos_order_gl_backfill(
  p_order_id uuid,
  p_dry_run  boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order         pos_orders%ROWTYPE;
  v_session       pos_sessions%ROWTYPE;
  v_terminal      pos_terminals%ROWTYPE;
  v_company_id    uuid;
  v_pay_count     int;
  v_current_method text;
  v_cash_box_id   uuid;
  v_box_gl_code   text;
  v_card_bank_gl  text := '1120';
  v_expected_debit text;
  v_current_debits text;
  v_updated       int := 0;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found','order_id',p_order_id);
  END IF;

  IF v_order.state <> 'paid' THEN
    RETURN jsonb_build_object('status','skipped_not_paid','order_id',p_order_id,'state',v_order.state);
  END IF;

  v_company_id := v_order.user_id;

  SELECT COUNT(DISTINCT payment_method) INTO v_pay_count
  FROM public.pos_payments
  WHERE order_id = p_order_id AND COALESCE(is_refund,false)=false;

  IF v_pay_count = 0 THEN
    RETURN jsonb_build_object('status','no_payment_rows','order_id',p_order_id);
  END IF;

  IF v_pay_count > 1 THEN
    RETURN jsonb_build_object(
      'status','needs_manual_review_mixed',
      'order_id',p_order_id,
      'order_number',v_order.order_number,
      'payment_methods',(SELECT jsonb_agg(DISTINCT payment_method) FROM public.pos_payments
                         WHERE order_id=p_order_id AND COALESCE(is_refund,false)=false)
    );
  END IF;

  SELECT payment_method INTO v_current_method
  FROM public.pos_payments
  WHERE order_id = p_order_id AND COALESCE(is_refund,false)=false
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = v_order.session_id;
  v_cash_box_id := v_session.cash_box_id;

  IF v_cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_cash_box_id;
  END IF;
  v_box_gl_code := COALESCE(v_box_gl_code, '1110');

  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;
  IF v_terminal.id IS NOT NULL THEN
    SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
      FROM public.pos_terminals t
      LEFT JOIN public.company_settings cs ON cs.user_id = t.user_id
      LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
     WHERE t.id = v_terminal.id
     LIMIT 1;
    v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');
  END IF;

  IF v_current_method = 'credit' THEN
    v_expected_debit := '1130';
  ELSIF v_current_method = 'card' THEN
    v_expected_debit := v_card_bank_gl;
  ELSIF v_current_method = 'employee_account' THEN
    v_expected_debit := '2180';
  ELSE
    v_expected_debit := public._pos_resolve_cash_gl(
      v_cash_box_id,
      COALESCE(upper(v_order.payment_currency), 'ILS'),
      v_box_gl_code);
  END IF;

  SELECT string_agg(DISTINCT debit_account_code, ',' ORDER BY debit_account_code)
    INTO v_current_debits
  FROM public.transactions
  WHERE user_id = v_company_id
    AND reference = v_order.order_number
    AND transaction_type IN ('pos_sale','pos_sale_vat')
    AND COALESCE(is_deleted,false)=false;

  IF v_current_debits IS NULL THEN
    RETURN jsonb_build_object(
      'status','no_gl_rows','order_id',p_order_id,'order_number',v_order.order_number);
  END IF;

  IF v_current_debits = v_expected_debit THEN
    RETURN jsonb_build_object(
      'status','already_matches','order_id',p_order_id,
      'order_number',v_order.order_number,
      'method',v_current_method,'debit',v_expected_debit);
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'status','would_fix','order_id',p_order_id,
      'order_number',v_order.order_number,
      'method',v_current_method,
      'current_debit',v_current_debits,
      'expected_debit',v_expected_debit,
      'total',v_order.total);
  END IF;

  UPDATE public.transactions
     SET debit_account_code = v_expected_debit,
         payment_method = v_current_method,
         updated_at = now(),
         notes = COALESCE(notes,'') || format(
           E'\n[gl-backfill %s] method_sync:%s debit:%s->%s',
           to_char(now(),'YYYY-MM-DD HH24:MI'),
           v_current_method, v_current_debits, v_expected_debit)
   WHERE user_id = v_company_id
     AND reference = v_order.order_number
     AND transaction_type IN ('pos_sale','pos_sale_vat')
     AND COALESCE(is_deleted,false)=false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.pos_sensitive_actions_log(
    company_id, action, invoice_id, notes, metadata)
  VALUES (
    v_company_id, 'gl_backfill', p_order_id,
    format('Backfilled GL from %s to %s (method=%s)',
           v_current_debits, v_expected_debit, v_current_method),
    jsonb_build_object(
      'order_number', v_order.order_number,
      'method', v_current_method,
      'from_debit', v_current_debits,
      'to_debit', v_expected_debit,
      'rows_updated', v_updated,
      'total', v_order.total));

  RETURN jsonb_build_object(
    'status','fixed','order_id',p_order_id,
    'order_number',v_order.order_number,
    'method',v_current_method,
    'from_debit',v_current_debits,
    'to_debit',v_expected_debit,
    'rows_updated',v_updated);
END;
$fn$;
