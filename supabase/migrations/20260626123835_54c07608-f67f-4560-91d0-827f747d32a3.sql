
CREATE OR REPLACE FUNCTION public.change_pos_payment_method(
  p_order_id uuid,
  p_new_method text,
  p_edit_reason text DEFAULT NULL,
  p_pos_user_id uuid DEFAULT NULL,
  p_manager_user_id uuid DEFAULT NULL,
  p_window_minutes integer DEFAULT 30,
  p_new_currency text DEFAULT NULL,
  p_new_exchange_rate numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order        pos_orders%ROWTYPE;
  v_session      pos_sessions%ROWTYPE;
  v_company_id   uuid;
  v_age_min      numeric;
  v_old_methods  text;
  v_old_currency text;
  v_old_rate     numeric;
  v_old_amount   numeric;
  v_updated      int;
  v_caller_owner uuid;
  v_pay_count    int;
  v_new_amount   numeric;
  v_currency_changed boolean := false;
BEGIN
  -- ─── 1) Validate new method ───────────────────────────────────────────
  IF p_new_method NOT IN ('cash','card','credit','employee_account') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001';
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

  -- ─── 5) Currency-change validation (only if requested) ────────────────
  IF p_new_currency IS NOT NULL AND upper(p_new_currency) <> 'ILS' OR
     (p_new_currency IS NOT NULL AND upper(p_new_currency) = 'ILS' AND p_new_exchange_rate IS NOT NULL) THEN
    -- Treat as currency-change request only if explicitly provided AND differs from existing
    v_currency_changed := true;
  END IF;

  -- Determine if currency actually changes
  IF p_new_currency IS NOT NULL THEN
    -- single-payment guard
    SELECT count(*) INTO v_pay_count FROM pos_payments WHERE order_id = p_order_id;
    IF v_pay_count > 1 THEN
      RAISE EXCEPTION 'MULTI_PAYMENT_CURRENCY_CHANGE_BLOCKED'
        USING ERRCODE = 'P0001',
              HINT    = 'لا يمكن تغيير العملة على فاتورة فيها أكثر من دفعة';
    END IF;

    -- only cash supports foreign currency
    IF p_new_method <> 'cash' THEN
      RAISE EXCEPTION 'CURRENCY_REQUIRES_CASH'
        USING ERRCODE = 'P0001',
              HINT    = 'تغيير العملة مسموح فقط مع الدفع النقدي';
    END IF;

    -- exchange rate required for non-ILS
    IF upper(p_new_currency) <> 'ILS' AND (p_new_exchange_rate IS NULL OR p_new_exchange_rate <= 0) THEN
      RAISE EXCEPTION 'INVALID_EXCHANGE_RATE'
        USING ERRCODE = 'P0001',
              HINT    = 'سعر الصرف مطلوب وإيجابي للعملات الأجنبية';
    END IF;

    -- currency must exist in tenant currencies
    IF NOT EXISTS (
      SELECT 1 FROM currencies
       WHERE user_id = v_company_id AND upper(code) = upper(p_new_currency)
    ) AND upper(p_new_currency) <> 'ILS' THEN
      RAISE EXCEPTION 'UNKNOWN_CURRENCY'
        USING ERRCODE = 'P0001',
              HINT    = 'العملة غير معرفة لهذا الحساب';
    END IF;
  END IF;

  -- ─── 6) Snapshot old values for audit ─────────────────────────────────
  SELECT string_agg(DISTINCT payment_method, '+'),
         string_agg(DISTINCT currency, '+'),
         avg(exchange_rate),
         sum(amount)
    INTO v_old_methods, v_old_currency, v_old_rate, v_old_amount
    FROM pos_payments
   WHERE order_id = p_order_id;

  -- ─── 7) Apply method change (always) ──────────────────────────────────
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

  -- ─── 8) Apply currency change if requested ────────────────────────────
  IF p_new_currency IS NOT NULL THEN
    IF upper(p_new_currency) = 'ILS' THEN
      -- convert back to ILS: amount = order total in ILS, rate=1
      v_new_amount := COALESCE(v_order.total, 0);
      UPDATE pos_payments
         SET currency      = 'ILS',
             exchange_rate = 1,
             amount        = v_new_amount,
             tendered      = v_new_amount,
             change_amount = 0
       WHERE order_id = p_order_id;
    ELSE
      -- amount in foreign = ILS_total / new_rate
      v_new_amount := round((COALESCE(v_order.total, 0) / p_new_exchange_rate)::numeric, 2);
      UPDATE pos_payments
         SET currency      = upper(p_new_currency),
             exchange_rate = p_new_exchange_rate,
             amount        = v_new_amount,
             tendered      = v_new_amount,
             change_amount = 0
       WHERE order_id = p_order_id;
    END IF;
  END IF;

  -- ─── 9) Audit log ─────────────────────────────────────────────────────
  INSERT INTO pos_sensitive_actions_log(
    company_id, action, pos_user_id, manager_user_id,
    session_id, invoice_id, notes, metadata
  ) VALUES (
    v_company_id,
    CASE WHEN p_new_currency IS NOT NULL
         THEN 'change_payment_method_and_currency'
         ELSE 'change_payment_method' END,
    p_pos_user_id,
    p_manager_user_id,
    v_order.session_id,
    v_order.id,
    p_edit_reason,
    jsonb_build_object(
      'from_method',   v_old_methods,
      'to_method',     p_new_method,
      'from_currency', v_old_currency,
      'to_currency',   COALESCE(upper(p_new_currency), v_old_currency),
      'from_rate',     v_old_rate,
      'to_rate',       COALESCE(p_new_exchange_rate, v_old_rate),
      'from_amount',   v_old_amount,
      'to_amount',     COALESCE(v_new_amount, v_old_amount),
      'order_total_ils', v_order.total,
      'rows_updated',  v_updated,
      'age_minutes',   round(v_age_min::numeric, 2),
      'window_minutes', p_window_minutes,
      'manager_bypass', (v_age_min > p_window_minutes)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'from_method', v_old_methods,
    'to_method',   p_new_method,
    'from_currency', v_old_currency,
    'to_currency',   COALESCE(upper(p_new_currency), v_old_currency),
    'rows_updated', v_updated
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_pos_payment_method(uuid, text, text, uuid, uuid, integer, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_pos_payment_method(uuid, text, text, uuid, uuid, integer, text, numeric) TO service_role;
