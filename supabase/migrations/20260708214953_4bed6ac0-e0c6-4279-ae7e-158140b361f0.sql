CREATE OR REPLACE FUNCTION public.change_pos_payment_method(
  p_order_id uuid, p_new_method text, p_edit_reason text DEFAULT NULL::text,
  p_pos_user_id uuid DEFAULT NULL::uuid, p_manager_user_id uuid DEFAULT NULL::uuid,
  p_window_minutes integer DEFAULT 30, p_new_currency text DEFAULT NULL::text,
  p_new_exchange_rate numeric DEFAULT NULL::numeric, p_employee_id uuid DEFAULT NULL::uuid,
  p_split_payments jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order pos_orders%ROWTYPE; v_session pos_sessions%ROWTYPE;
  v_company_id uuid; v_age_min numeric;
  v_old_methods text; v_old_currency text; v_old_rate numeric; v_old_amount numeric;
  v_updated int := 0; v_caller_owner uuid; v_pay_count int; v_new_amount numeric;
  v_split_total numeric := 0; v_split_row jsonb; v_emp_name text;
  v_movements_revrs int := 0; v_old_emp_movements jsonb;
  v_meal_pct numeric; v_meal_full numeric; v_meal_deducted numeric;
  v_company_uuid uuid;
BEGIN
  IF p_new_method NOT IN ('cash','card','credit','employee_account','mixed') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001'; END IF;
  IF p_new_method = 'employee_account' AND p_employee_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF p_new_method = 'mixed' THEN
    IF p_split_payments IS NULL OR jsonb_typeof(p_split_payments) <> 'array' OR jsonb_array_length(p_split_payments) < 2 THEN
      RAISE EXCEPTION 'SPLIT_PAYMENTS_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT * INTO v_order FROM pos_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_caller_owner := resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_order.user_id <> v_caller_owner THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0001'; END IF;
  v_company_id := v_order.user_id;

  IF v_order.state <> 'paid' THEN RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001'; END IF;
  IF v_order.is_return THEN RAISE EXCEPTION 'ORDER_IS_RETURN' USING ERRCODE = 'P0001'; END IF;
  IF v_order.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = 'P0001'; END IF;
  IF v_order.paid_at IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_PAID_AT' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_session FROM pos_sessions WHERE id = v_order.session_id FOR UPDATE;
  IF NOT FOUND OR v_session.state <> 'open' THEN
    RAISE EXCEPTION 'SESSION_NOT_OPEN' USING ERRCODE = 'P0001'; END IF;

  v_age_min := EXTRACT(EPOCH FROM (now() - v_order.paid_at)) / 60.0;
  IF v_age_min > p_window_minutes AND p_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED' USING ERRCODE = 'P0001',
      HINT = format('انتهت مدة السماح (%s دقيقة) — يتطلب موافقة مدير', p_window_minutes); END IF;

  IF p_new_method = 'employee_account' THEN
    SELECT full_name INTO v_emp_name FROM employees WHERE id = p_employee_id AND user_id = v_company_id;
    IF v_emp_name IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF p_new_method = 'mixed' THEN
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
      IF COALESCE(v_split_row->>'method','') NOT IN ('cash','card','credit') THEN
        RAISE EXCEPTION 'SPLIT_INVALID_METHOD' USING ERRCODE = 'P0001',
          HINT = 'الدفع المختلط يدعم فقط: نقدي / بطاقة / آجل'; END IF;
      IF COALESCE((v_split_row->>'amount')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'SPLIT_INVALID_AMOUNT' USING ERRCODE = 'P0001'; END IF;
      v_split_total := v_split_total + (v_split_row->>'amount')::numeric;
    END LOOP;
    IF abs(v_split_total - COALESCE(v_order.total, 0)) > 0.01 THEN
      RAISE EXCEPTION 'SPLIT_AMOUNT_MISMATCH' USING ERRCODE = 'P0001',
        HINT = format('مجموع الدفعات (%s) لا يطابق إجمالي الفاتورة (%s)', v_split_total, v_order.total); END IF;
  END IF;

  IF p_new_currency IS NOT NULL AND p_new_method = 'mixed' THEN
    RAISE EXCEPTION 'CURRENCY_REQUIRES_SINGLE_METHOD' USING ERRCODE = 'P0001',
      HINT = 'تغيير العملة غير مدعوم في الدفع المختلط'; END IF;
  IF p_new_currency IS NOT NULL THEN
    SELECT count(*) INTO v_pay_count FROM pos_payments WHERE order_id = p_order_id;
    IF v_pay_count > 1 THEN RAISE EXCEPTION 'MULTI_PAYMENT_CURRENCY_CHANGE_BLOCKED' USING ERRCODE = 'P0001',
      HINT = 'لا يمكن تغيير العملة على فاتورة فيها أكثر من دفعة'; END IF;
    IF p_new_method <> 'cash' THEN RAISE EXCEPTION 'CURRENCY_REQUIRES_CASH' USING ERRCODE = 'P0001',
      HINT = 'تغيير العملة مسموح فقط مع الدفع النقدي'; END IF;
    IF upper(p_new_currency) <> 'ILS' AND (p_new_exchange_rate IS NULL OR p_new_exchange_rate <= 0) THEN
      RAISE EXCEPTION 'INVALID_EXCHANGE_RATE' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM currencies WHERE user_id = v_company_id AND upper(code) = upper(p_new_currency))
       AND upper(p_new_currency) <> 'ILS' THEN
      RAISE EXCEPTION 'UNKNOWN_CURRENCY' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT string_agg(DISTINCT payment_method, '+'), string_agg(DISTINCT currency, '+'),
         avg(exchange_rate), sum(amount)
    INTO v_old_methods, v_old_currency, v_old_rate, v_old_amount
    FROM pos_payments WHERE order_id = p_order_id;

  IF v_old_methods ILIKE '%employee_account%' AND p_new_method <> 'employee_account' THEN
    WITH src AS (
      SELECT id, employee_id, amount, source_reference, reference_number
        FROM employee_financial_movements
       WHERE user_id = v_company_id AND source_type = 'pos_meal' AND source_id = p_order_id
         AND movement_type='debit' AND status='approved'
         AND NOT EXISTS (
           SELECT 1 FROM employee_financial_movements r
            WHERE r.user_id=v_company_id AND r.source_type='pos_meal_reversal'
              AND r.source_id=p_order_id AND r.employee_id=employee_financial_movements.employee_id)
    ), ins AS (
      INSERT INTO employee_financial_movements (
        user_id, employee_id, source_type, source_id, source_reference, reference_number,
        category, description, amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes)
      SELECT v_company_id, src.employee_id, 'pos_meal_reversal', p_order_id,
        src.source_reference, src.reference_number, 'food',
        format('عكس وجبة POS — تعديل طريقة الدفع (فاتورة #%s)', COALESCE(v_order.order_number,'-')),
        src.amount, 'credit', 'approved', CURRENT_DATE,
        EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int, p_pos_user_id,
        format('عكس آلي لحركة pos_meal بسبب تعديل طريقة الدفع. السبب: %s | manager:%s',
               COALESCE(p_edit_reason,'—'), COALESCE(p_manager_user_id::text,'—'))
      FROM src RETURNING 1)
    SELECT count(*) INTO v_movements_revrs FROM ins;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'amount', amount))
    INTO v_old_emp_movements FROM employee_financial_movements
   WHERE user_id=v_company_id AND source_type='pos_meal' AND source_id=p_order_id
     AND movement_type='debit' AND status='approved';

  IF p_new_method = 'mixed' THEN
    DELETE FROM pos_payments WHERE order_id = p_order_id;
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
      INSERT INTO pos_payments(
        user_id, order_id, payment_method, amount, tendered, change_amount,
        currency, exchange_rate, original_payment_method,
        payment_edited_at, payment_edited_by_pos_user_id,
        payment_edit_manager_user_id, payment_edit_reason)
      VALUES (v_company_id, p_order_id, v_split_row->>'method',
        (v_split_row->>'amount')::numeric, (v_split_row->>'amount')::numeric,
        0,
        COALESCE(upper(v_split_row->>'currency'), 'ILS'),
        COALESCE((v_split_row->>'exchange_rate')::numeric, 1),
        v_old_methods, now(), p_pos_user_id, p_manager_user_id, p_edit_reason);
      v_updated := v_updated + 1;
    END LOOP;
  ELSE
    UPDATE pos_payments
       SET original_payment_method = COALESCE(original_payment_method, payment_method),
           payment_method = p_new_method, payment_edited_at = now(),
           payment_edited_by_pos_user_id = p_pos_user_id,
           payment_edit_manager_user_id = p_manager_user_id,
           payment_edit_reason = p_edit_reason
     WHERE order_id = p_order_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'NO_PAYMENTS_FOUND' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF p_new_currency IS NOT NULL AND p_new_method <> 'mixed' THEN
    IF upper(p_new_currency) = 'ILS' THEN
      v_new_amount := COALESCE(v_order.total, 0);
      UPDATE pos_payments SET currency='ILS', exchange_rate=1,
             amount=v_new_amount, tendered=v_new_amount, change_amount=0
       WHERE order_id = p_order_id;
      UPDATE pos_orders SET payment_currency='ILS', payment_currency_amount=v_new_amount,
             payment_currency_rate=1 WHERE id = p_order_id;
    ELSE
      v_new_amount := round((COALESCE(v_order.total, 0) / p_new_exchange_rate)::numeric, 2);
      UPDATE pos_payments SET currency=upper(p_new_currency), exchange_rate=p_new_exchange_rate,
             amount=v_new_amount, tendered=v_new_amount, change_amount=0
       WHERE order_id = p_order_id;
      UPDATE pos_orders SET payment_currency=upper(p_new_currency),
             payment_currency_amount=v_new_amount, payment_currency_rate=p_new_exchange_rate
       WHERE id = p_order_id;
    END IF;
  END IF;

  IF p_new_method = 'mixed' THEN
    UPDATE pos_orders SET payment_currency='ILS',
       payment_currency_amount=COALESCE(v_order.total, 0), payment_currency_rate=1
     WHERE id = p_order_id;
  END IF;

  IF p_new_method = 'employee_account' THEN
    UPDATE pos_orders SET payment_currency='ILS',
       payment_currency_amount=COALESCE(v_order.total, 0), payment_currency_rate=1
     WHERE id = p_order_id;
  END IF;

  IF p_new_method = 'employee_account'
     AND COALESCE(v_old_methods,'') NOT ILIKE '%employee_account%' THEN
    -- Apply company meal-share % (default 50). Matches POSPage.tsx L4693.
    v_meal_pct := 50;
    BEGIN
      SELECT id INTO v_company_uuid FROM companies WHERE owner_id = v_company_id LIMIT 1;
      IF v_company_uuid IS NOT NULL THEN
        SELECT COALESCE(food_individual_percentage, 50) INTO v_meal_pct
          FROM payroll_settings WHERE company_id = v_company_uuid LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN v_meal_pct := 50; END;
    v_meal_pct := GREATEST(0, LEAST(100, COALESCE(v_meal_pct, 50)));
    v_meal_full := COALESCE(v_order.total, 0);
    v_meal_deducted := round((v_meal_full * v_meal_pct / 100.0)::numeric, 2);

    IF v_meal_deducted > 0 THEN
      INSERT INTO employee_financial_movements (
        user_id, employee_id, source_type, source_id, source_reference, reference_number,
        category, description, amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes,
        meal_discount_pct, original_full_amount)
      VALUES (v_company_id, p_employee_id, 'pos_meal', p_order_id,
        v_order.order_number, v_order.order_number, 'food',
        format('وجبة POS (تحويل لحساب موظف) - فاتورة #%s', COALESCE(v_order.order_number,'-')),
        v_meal_deducted, 'debit', 'approved', CURRENT_DATE,
        EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int, p_pos_user_id,
        format('تحويل آلي عبر تعديل طريقة الدفع. إجمالي الفاتورة: %s | نسبة خصم الموظف: %s%% | الخصم الفعلي: %s | السبب: %s | manager:%s',
               v_meal_full::text, v_meal_pct::text, v_meal_deducted::text,
               COALESCE(p_edit_reason,'—'), COALESCE(p_manager_user_id::text,'—')),
        v_meal_pct, v_meal_full);
    END IF;
  END IF;

  DECLARE
    v_new_debit_account text; v_new_currency_used text;
    v_gl_rows_updated int := 0; v_gl_rows_deleted int := 0;
    v_tender jsonb; v_tender_idx int := 0; v_n_new_tenders int;
    v_new_debit text; v_new_rev_acc text := '4100'; v_new_vat_acc text;
    v_terminal record; v_box_gl_code text; v_card_bank_gl text := '1120';
    v_running_net numeric := 0; v_running_vat numeric := 0;
    v_tender_net numeric; v_tender_vat numeric;
    v_net_total numeric; v_vat_total numeric; v_tender_share numeric;
    v_customer_id uuid; v_tender_currency text;
  BEGIN
    v_new_currency_used := COALESCE(upper(p_new_currency), COALESCE(upper(v_old_currency), 'ILS'));

    IF v_order.cash_box_id IS NOT NULL THEN
      SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_order.cash_box_id;
    END IF;
    v_box_gl_code := COALESCE(v_box_gl_code, '1110');

    SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;
    IF v_terminal.id IS NOT NULL THEN
      SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
      FROM public.pos_terminals t
      LEFT JOIN public.company_settings cs ON cs.user_id = t.user_id
      LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
      WHERE t.id = v_terminal.id LIMIT 1;
      v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');
      v_new_rev_acc := COALESCE(v_terminal.revenue_account_code, '4100');
    END IF;

    SELECT credit_account_code INTO v_new_vat_acc
      FROM public.transactions
     WHERE user_id = v_company_id AND reference = v_order.order_number
       AND transaction_type = 'pos_sale_vat' AND COALESCE(is_deleted, false) = false LIMIT 1;

    v_customer_id := v_order.customer_id;

    IF p_new_method <> 'mixed' THEN
      IF p_new_method = 'credit' THEN v_new_debit_account := '1130';
      ELSIF p_new_method = 'card' THEN v_new_debit_account := v_card_bank_gl;
      ELSIF p_new_method = 'employee_account' THEN
        SELECT COALESCE(linked_account_code, '2180') INTO v_new_debit_account
          FROM public.employees WHERE id = p_employee_id AND user_id = v_company_id;
        v_new_debit_account := COALESCE(v_new_debit_account, '2180');
      ELSE
        v_new_debit_account := public._pos_resolve_cash_gl(
          v_order.cash_box_id, v_new_currency_used, v_box_gl_code);
      END IF;

      UPDATE public.transactions
         SET debit_account_code = v_new_debit_account, payment_method = p_new_method, updated_at = now(),
             notes = COALESCE(notes,'') || format(
               E'\n[gl-sync %s] method:%s->%s cur:%s->%s by:%s reason:%s',
               to_char(now(),'YYYY-MM-DD HH24:MI'),
               COALESCE(v_old_methods,'-'), p_new_method,
               COALESCE(v_old_currency,'ILS'), v_new_currency_used,
               COALESCE(p_pos_user_id::text,'-'), COALESCE(p_edit_reason,'-'))
       WHERE user_id = v_company_id AND reference = v_order.order_number
         AND transaction_type IN ('pos_sale','pos_sale_vat')
         AND COALESCE(is_deleted, false) = false;
      GET DIAGNOSTICS v_gl_rows_updated = ROW_COUNT;
    ELSE
      UPDATE public.transactions
         SET is_deleted = true, updated_at = now(),
             notes = COALESCE(notes,'') || format(
               E'\n[gl-sync %s] soft-deleted for mixed-split re-post reason:%s',
               to_char(now(),'YYYY-MM-DD HH24:MI'), COALESCE(p_edit_reason,'-'))
       WHERE user_id = v_company_id AND reference = v_order.order_number
         AND transaction_type IN ('pos_sale','pos_sale_vat')
         AND COALESCE(is_deleted, false) = false;
      GET DIAGNOSTICS v_gl_rows_deleted = ROW_COUNT;

      v_net_total := COALESCE(v_order.subtotal, v_order.total, 0) - COALESCE(v_order.discount_amount, 0);
      v_vat_total := COALESCE(v_order.tax_amount, 0);
      IF v_net_total < 0 THEN v_net_total := 0; END IF;

      v_n_new_tenders := jsonb_array_length(p_split_payments);
      FOR v_tender IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
        v_tender_idx := v_tender_idx + 1;
        v_tender_currency := COALESCE(upper(v_tender->>'currency'), 'ILS');
        IF (v_tender->>'method') = 'credit' THEN v_new_debit := '1130';
        ELSIF (v_tender->>'method') = 'card' THEN v_new_debit := v_card_bank_gl;
        ELSE v_new_debit := public._pos_resolve_cash_gl(v_order.cash_box_id, v_tender_currency, v_box_gl_code);
        END IF;

        IF v_tender_idx = v_n_new_tenders THEN
          v_tender_net := GREATEST(v_net_total - v_running_net, 0);
          v_tender_vat := GREATEST(v_vat_total - v_running_vat, 0);
        ELSIF COALESCE(v_order.total,0) > 0 THEN
          v_tender_share := (v_tender->>'amount')::numeric / v_order.total;
          v_tender_net := ROUND(v_net_total * v_tender_share, 2);
          v_tender_vat := ROUND(v_vat_total * v_tender_share, 2);
          v_running_net := v_running_net + v_tender_net;
          v_running_vat := v_running_vat + v_tender_vat;
        ELSE v_tender_net := 0; v_tender_vat := 0; END IF;

        IF v_tender_net > 0 THEN
          INSERT INTO public.transactions(
            user_id, transaction_date, description,
            debit_account_code, credit_account_code,
            amount, currency, transaction_type, contact_id,
            reference, payment_method, idempotency_key)
          VALUES (v_company_id, CURRENT_DATE,
            'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number,'') || ' (' || (v_tender->>'method') || ')',
            v_new_debit, v_new_rev_acc, v_tender_net,
            CASE v_tender_currency WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو' ELSE 'شيكل' END,
            'pos_sale', v_customer_id, v_order.order_number,
            v_tender->>'method',
            'POS-ORDER-' || v_order.id::text || '-MIXFIX-T' || v_tender_idx || '-' || floor(extract(epoch from now()))::text);
        END IF;
        IF v_tender_vat > 0 AND v_new_vat_acc IS NOT NULL THEN
          INSERT INTO public.transactions(
            user_id, transaction_date, description,
            debit_account_code, credit_account_code,
            amount, currency, transaction_type, contact_id,
            reference, payment_method, idempotency_key)
          VALUES (v_company_id, CURRENT_DATE,
            'ضريبة قيمة مضافة (مخرجات) - POS ' || COALESCE(v_order.order_number,'') || ' (' || (v_tender->>'method') || ')',
            v_new_debit, v_new_vat_acc, v_tender_vat,
            CASE v_tender_currency WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو' ELSE 'شيكل' END,
            'pos_sale_vat', v_customer_id, v_order.order_number,
            v_tender->>'method',
            'POS-ORDER-' || v_order.id::text || '-MIXFIX-VAT-T' || v_tender_idx || '-' || floor(extract(epoch from now()))::text);
        END IF;
      END LOOP;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_gl_rows_updated := -1;
    RAISE NOTICE 'GL-sync failed for order %: % / %', v_order.id, SQLERRM, SQLSTATE;
  END;

  INSERT INTO pos_sensitive_actions_log(
    company_id, action, pos_user_id, manager_user_id,
    session_id, invoice_id, notes, metadata)
  VALUES (v_company_id,
    CASE WHEN p_new_method='mixed' THEN 'change_payment_method_to_mixed'
         WHEN p_new_method='employee_account' THEN 'change_payment_method_to_employee_account'
         WHEN p_new_currency IS NOT NULL THEN 'change_payment_method_and_currency'
         ELSE 'change_payment_method' END,
    p_pos_user_id, p_manager_user_id, v_order.session_id, v_order.id, p_edit_reason,
    jsonb_build_object(
      'from_method', v_old_methods, 'to_method', p_new_method,
      'from_currency', v_old_currency, 'to_currency', COALESCE(upper(p_new_currency), v_old_currency),
      'from_rate', v_old_rate, 'to_rate', COALESCE(p_new_exchange_rate, v_old_rate),
      'from_amount', v_old_amount, 'to_amount', COALESCE(v_new_amount, v_old_amount),
      'order_total_ils', v_order.total, 'rows_updated', v_updated,
      'age_minutes', round(v_age_min::numeric, 2), 'window_minutes', p_window_minutes,
      'manager_bypass', (v_age_min > p_window_minutes),
      'employee_id', p_employee_id, 'employee_name', v_emp_name,
      'split_payments', p_split_payments, 'emp_reversals', v_movements_revrs,
      'old_emp_movements', v_old_emp_movements,
      'header_currency_synced', true, 'gl_sync_applied', true));

  RETURN jsonb_build_object('ok', true, 'order_id', v_order.id,
    'from_method', v_old_methods, 'to_method', p_new_method,
    'from_currency', v_old_currency, 'to_currency', COALESCE(upper(p_new_currency), v_old_currency),
    'rows_updated', v_updated, 'emp_reversals', v_movements_revrs,
    'employee_id', p_employee_id, 'header_synced', true, 'gl_synced', true);
END;
$function$;

DO $$
DECLARE
  r record; v_pct numeric; v_new_amt numeric;
BEGIN
  FOR r IN
    SELECT efm.id, efm.user_id, efm.original_full_amount
      FROM employee_financial_movements efm
     WHERE efm.source_type = 'pos_meal'
       AND efm.status = 'approved'
       AND efm.meal_discount_pct = 100
       AND efm.description LIKE 'وجبة POS (تحويل لحساب موظف)%'
       AND efm.original_full_amount IS NOT NULL
       AND efm.original_full_amount > 0
  LOOP
    v_pct := 50;
    BEGIN
      SELECT COALESCE(ps.food_individual_percentage, 50) INTO v_pct
        FROM payroll_settings ps
        JOIN companies c ON c.id = ps.company_id
       WHERE c.owner_id = r.user_id
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_pct := 50; END;
    v_pct := GREATEST(0, LEAST(100, COALESCE(v_pct, 50)));
    v_new_amt := round((r.original_full_amount * v_pct / 100.0)::numeric, 2);
    UPDATE employee_financial_movements
       SET amount = v_new_amt,
           meal_discount_pct = v_pct,
           notes = COALESCE(notes,'') || format(
             E'\n[backfill %s] recalculated to %s%% share (was 100%%): %s',
             to_char(now(),'YYYY-MM-DD HH24:MI'), v_pct::text, v_new_amt::text),
           updated_at = now()
     WHERE id = r.id;
  END LOOP;
END $$;