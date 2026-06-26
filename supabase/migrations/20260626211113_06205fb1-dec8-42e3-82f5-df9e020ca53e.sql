
-- Drop the old signature first to allow adding new params.
DROP FUNCTION IF EXISTS public.change_pos_payment_method(
  uuid, text, text, uuid, uuid, integer, text, numeric
);

CREATE OR REPLACE FUNCTION public.change_pos_payment_method(
  p_order_id              uuid,
  p_new_method            text,
  p_edit_reason           text    DEFAULT NULL,
  p_pos_user_id           uuid    DEFAULT NULL,
  p_manager_user_id       uuid    DEFAULT NULL,
  p_window_minutes        integer DEFAULT 30,
  p_new_currency          text    DEFAULT NULL,
  p_new_exchange_rate     numeric DEFAULT NULL,
  p_employee_id           uuid    DEFAULT NULL,
  p_split_payments        jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order            pos_orders%ROWTYPE;
  v_session          pos_sessions%ROWTYPE;
  v_company_id       uuid;
  v_age_min          numeric;
  v_old_methods      text;
  v_old_currency     text;
  v_old_rate         numeric;
  v_old_amount       numeric;
  v_updated          int := 0;
  v_caller_owner     uuid;
  v_pay_count        int;
  v_new_amount       numeric;
  v_split_total      numeric := 0;
  v_split_row        jsonb;
  v_emp_name         text;
  v_movements_revrs  int := 0;
  v_old_emp_movements jsonb;
BEGIN
  -- ─── 1) Validate new method ───────────────────────────────────────────
  IF p_new_method NOT IN ('cash','card','credit','employee_account','mixed') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_method = 'employee_account' AND p_employee_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_method = 'mixed' THEN
    IF p_split_payments IS NULL OR jsonb_typeof(p_split_payments) <> 'array' OR jsonb_array_length(p_split_payments) < 2 THEN
      RAISE EXCEPTION 'SPLIT_PAYMENTS_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ─── 2) Lock order ────────────────────────────────────────────────────
  SELECT * INTO v_order FROM pos_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_caller_owner := resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_order.user_id <> v_caller_owner THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0001';
  END IF;
  v_company_id := v_order.user_id;

  -- ─── 3) State checks ──────────────────────────────────────────────────
  IF v_order.state <> 'paid' THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.is_return THEN
    RAISE EXCEPTION 'ORDER_IS_RETURN' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.paid_at IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID_AT' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session FROM pos_sessions WHERE id = v_order.session_id FOR UPDATE;
  IF NOT FOUND OR v_session.state <> 'open' THEN
    RAISE EXCEPTION 'SESSION_NOT_OPEN' USING ERRCODE = 'P0001';
  END IF;

  -- ─── 4) Time-window check ─────────────────────────────────────────────
  v_age_min := EXTRACT(EPOCH FROM (now() - v_order.paid_at)) / 60.0;
  IF v_age_min > p_window_minutes AND p_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED'
      USING ERRCODE = 'P0001',
            HINT    = format('انتهت مدة السماح (%s دقيقة) — يتطلب موافقة مدير', p_window_minutes);
  END IF;

  -- ─── 5) Validate employee exists (if needed) ─────────────────────────
  IF p_new_method = 'employee_account' THEN
    SELECT full_name INTO v_emp_name FROM employees
      WHERE id = p_employee_id AND user_id = v_company_id;
    IF v_emp_name IS NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ─── 6) Validate split totals (if mixed) ─────────────────────────────
  IF p_new_method = 'mixed' THEN
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments)
    LOOP
      IF COALESCE(v_split_row->>'method','') NOT IN ('cash','card','credit') THEN
        RAISE EXCEPTION 'SPLIT_INVALID_METHOD' USING ERRCODE = 'P0001',
          HINT = 'الدفع المختلط يدعم فقط: نقدي / بطاقة / آجل';
      END IF;
      IF COALESCE((v_split_row->>'amount')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'SPLIT_INVALID_AMOUNT' USING ERRCODE = 'P0001';
      END IF;
      v_split_total := v_split_total + (v_split_row->>'amount')::numeric;
    END LOOP;
    IF abs(v_split_total - COALESCE(v_order.total, 0)) > 0.01 THEN
      RAISE EXCEPTION 'SPLIT_AMOUNT_MISMATCH'
        USING ERRCODE = 'P0001',
              HINT    = format('مجموع الدفعات (%s) لا يطابق إجمالي الفاتورة (%s)', v_split_total, v_order.total);
    END IF;
  END IF;

  -- ─── 7) Currency-change validation (single-row methods only) ─────────
  IF p_new_currency IS NOT NULL AND p_new_method = 'mixed' THEN
    RAISE EXCEPTION 'CURRENCY_REQUIRES_SINGLE_METHOD'
      USING ERRCODE = 'P0001',
            HINT    = 'تغيير العملة غير مدعوم في الدفع المختلط';
  END IF;

  IF p_new_currency IS NOT NULL THEN
    SELECT count(*) INTO v_pay_count FROM pos_payments WHERE order_id = p_order_id;
    IF v_pay_count > 1 THEN
      RAISE EXCEPTION 'MULTI_PAYMENT_CURRENCY_CHANGE_BLOCKED'
        USING ERRCODE = 'P0001',
              HINT    = 'لا يمكن تغيير العملة على فاتورة فيها أكثر من دفعة';
    END IF;
    IF p_new_method <> 'cash' THEN
      RAISE EXCEPTION 'CURRENCY_REQUIRES_CASH'
        USING ERRCODE = 'P0001',
              HINT    = 'تغيير العملة مسموح فقط مع الدفع النقدي';
    END IF;
    IF upper(p_new_currency) <> 'ILS' AND (p_new_exchange_rate IS NULL OR p_new_exchange_rate <= 0) THEN
      RAISE EXCEPTION 'INVALID_EXCHANGE_RATE' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM currencies
       WHERE user_id = v_company_id AND upper(code) = upper(p_new_currency)
    ) AND upper(p_new_currency) <> 'ILS' THEN
      RAISE EXCEPTION 'UNKNOWN_CURRENCY' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ─── 8) Snapshot OLD payment values for audit ────────────────────────
  SELECT string_agg(DISTINCT payment_method, '+'),
         string_agg(DISTINCT currency, '+'),
         avg(exchange_rate),
         sum(amount)
    INTO v_old_methods, v_old_currency, v_old_rate, v_old_amount
    FROM pos_payments
   WHERE order_id = p_order_id;

  -- ─── 9) REVERSE old employee_account movements if leaving emp account ─
  --       (Credit-Note pattern: create reversing entries, do NOT delete)
  IF v_old_methods ILIKE '%employee_account%' AND p_new_method <> 'employee_account' THEN
    WITH src AS (
      SELECT id, employee_id, amount, source_reference, reference_number
        FROM employee_financial_movements
       WHERE user_id      = v_company_id
         AND source_type  = 'pos_meal'
         AND source_id    = p_order_id
         AND movement_type= 'debit'
         AND status       = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM employee_financial_movements r
            WHERE r.user_id     = v_company_id
              AND r.source_type = 'pos_meal_reversal'
              AND r.source_id   = p_order_id
              AND r.employee_id = employee_financial_movements.employee_id
         )
    ),
    ins AS (
      INSERT INTO employee_financial_movements (
        user_id, employee_id, source_type, source_id, source_reference, reference_number,
        category, description, amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes
      )
      SELECT
        v_company_id, src.employee_id, 'pos_meal_reversal', p_order_id,
        src.source_reference, src.reference_number,
        'food',
        format('عكس وجبة POS — تعديل طريقة الدفع (فاتورة #%s)', COALESCE(v_order.order_number,'-')),
        src.amount, 'credit', 'approved', CURRENT_DATE,
        EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int,
        p_pos_user_id,
        format('عكس آلي لحركة pos_meal بسبب تعديل طريقة الدفع. السبب: %s | manager:%s',
               COALESCE(p_edit_reason,'—'), COALESCE(p_manager_user_id::text,'—'))
      FROM src
      RETURNING 1
    )
    SELECT count(*) INTO v_movements_revrs FROM ins;
  END IF;

  -- Capture remaining (un-reversed) emp movements info for audit jsonb
  SELECT jsonb_agg(jsonb_build_object('employee_id', employee_id, 'amount', amount))
    INTO v_old_emp_movements
    FROM employee_financial_movements
   WHERE user_id     = v_company_id
     AND source_type = 'pos_meal'
     AND source_id   = p_order_id
     AND movement_type = 'debit'
     AND status      = 'approved';

  -- ─── 10) Apply method change on pos_payments ─────────────────────────
  IF p_new_method = 'mixed' THEN
    -- Replace all payment rows with new split
    DELETE FROM pos_payments WHERE order_id = p_order_id;
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments)
    LOOP
      INSERT INTO pos_payments(
        user_id, order_id, payment_method, amount, tendered, change_amount,
        currency, exchange_rate, original_payment_method,
        payment_edited_at, payment_edited_by_pos_user_id,
        payment_edit_manager_user_id, payment_edit_reason
      ) VALUES (
        v_company_id, p_order_id,
        v_split_row->>'method',
        (v_split_row->>'amount')::numeric,
        (v_split_row->>'amount')::numeric,
        0, 'ILS', 1, v_old_methods,
        now(), p_pos_user_id, p_manager_user_id, p_edit_reason
      );
      v_updated := v_updated + 1;
    END LOOP;
  ELSE
    UPDATE pos_payments
       SET original_payment_method     = COALESCE(original_payment_method, payment_method),
           payment_method              = p_new_method,
           payment_edited_at           = now(),
           payment_edited_by_pos_user_id = p_pos_user_id,
           payment_edit_manager_user_id  = p_manager_user_id,
           payment_edit_reason         = p_edit_reason
     WHERE order_id = p_order_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'NO_PAYMENTS_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ─── 11) Currency change application (single-method only) ────────────
  IF p_new_currency IS NOT NULL AND p_new_method <> 'mixed' THEN
    IF upper(p_new_currency) = 'ILS' THEN
      v_new_amount := COALESCE(v_order.total, 0);
      UPDATE pos_payments
         SET currency = 'ILS', exchange_rate = 1,
             amount = v_new_amount, tendered = v_new_amount, change_amount = 0
       WHERE order_id = p_order_id;
    ELSE
      v_new_amount := round((COALESCE(v_order.total, 0) / p_new_exchange_rate)::numeric, 2);
      UPDATE pos_payments
         SET currency = upper(p_new_currency), exchange_rate = p_new_exchange_rate,
             amount = v_new_amount, tendered = v_new_amount, change_amount = 0
       WHERE order_id = p_order_id;
    END IF;
  END IF;

  -- ─── 12) CREATE new employee_account movement if entering emp account ─
  IF p_new_method = 'employee_account'
     AND COALESCE(v_old_methods,'') NOT ILIKE '%employee_account%' THEN
    INSERT INTO employee_financial_movements (
      user_id, employee_id, source_type, source_id, source_reference, reference_number,
      category, description, amount, movement_type, status, movement_date,
      salary_month, salary_year, created_by, notes,
      meal_discount_pct, original_full_amount
    ) VALUES (
      v_company_id, p_employee_id, 'pos_meal', p_order_id,
      v_order.order_number, v_order.order_number,
      'food',
      format('وجبة POS (تحويل لحساب موظف) - فاتورة #%s', COALESCE(v_order.order_number,'-')),
      COALESCE(v_order.total, 0), 'debit', 'approved', CURRENT_DATE,
      EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int,
      p_pos_user_id,
      format('تحويل آلي عبر تعديل طريقة الدفع. السبب: %s | manager:%s',
             COALESCE(p_edit_reason,'—'), COALESCE(p_manager_user_id::text,'—')),
      100, COALESCE(v_order.total, 0)
    );
  END IF;

  -- ─── 13) Audit log ───────────────────────────────────────────────────
  INSERT INTO pos_sensitive_actions_log(
    company_id, action, pos_user_id, manager_user_id,
    session_id, invoice_id, notes, metadata
  ) VALUES (
    v_company_id,
    CASE
      WHEN p_new_method = 'mixed' THEN 'change_payment_method_to_mixed'
      WHEN p_new_method = 'employee_account' THEN 'change_payment_method_to_employee_account'
      WHEN p_new_currency IS NOT NULL THEN 'change_payment_method_and_currency'
      ELSE 'change_payment_method'
    END,
    p_pos_user_id, p_manager_user_id, v_order.session_id, v_order.id, p_edit_reason,
    jsonb_build_object(
      'from_method',     v_old_methods,
      'to_method',       p_new_method,
      'from_currency',   v_old_currency,
      'to_currency',     COALESCE(upper(p_new_currency), v_old_currency),
      'from_rate',       v_old_rate,
      'to_rate',         COALESCE(p_new_exchange_rate, v_old_rate),
      'from_amount',     v_old_amount,
      'to_amount',       COALESCE(v_new_amount, v_old_amount),
      'order_total_ils', v_order.total,
      'rows_updated',    v_updated,
      'age_minutes',     round(v_age_min::numeric, 2),
      'window_minutes',  p_window_minutes,
      'manager_bypass',  (v_age_min > p_window_minutes),
      'employee_id',     p_employee_id,
      'employee_name',   v_emp_name,
      'split_payments',  p_split_payments,
      'emp_reversals',   v_movements_revrs,
      'old_emp_movements', v_old_emp_movements
    )
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'order_id',        v_order.id,
    'from_method',     v_old_methods,
    'to_method',       p_new_method,
    'from_currency',   v_old_currency,
    'to_currency',     COALESCE(upper(p_new_currency), v_old_currency),
    'rows_updated',    v_updated,
    'emp_reversals',   v_movements_revrs,
    'employee_id',     p_employee_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_pos_payment_method(
  uuid, text, text, uuid, uuid, integer, text, numeric, uuid, jsonb
) TO authenticated, service_role;
