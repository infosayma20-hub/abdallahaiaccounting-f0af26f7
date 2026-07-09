-- ============================================================
-- POS Integrity Guards + Diagnostic Recompute (read-only + safe guard)
-- ============================================================

-- 1) GUARD: block any future employee_account payment from landing on 11300000
--    (generic "cash customers" fallback). Silent no-op for other cases.
CREATE OR REPLACE FUNCTION public.guard_pos_employee_account_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method TEXT;
BEGIN
  IF NEW.pos_order_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.transaction_type NOT IN ('pos_sale','pos_payment','pos_meal_subsidy') THEN
    RETURN NEW;
  END IF;

  -- Only guard rows tied to an employee_account payment
  SELECT payment_method INTO v_method
  FROM public.pos_payments
  WHERE order_id = NEW.pos_order_id
  ORDER BY created_at ASC LIMIT 1;

  IF v_method = 'employee_account' THEN
    IF NEW.debit_account_code = '11300000' OR NEW.credit_account_code = '11300000' THEN
      RAISE EXCEPTION 'ترحيل غير مسموح: حساب الموظف مطلوب لدفع employee_account (لا يجوز استخدام 11300000)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pos_employee_account_posting ON public.transactions;
CREATE TRIGGER trg_guard_pos_employee_account_posting
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_pos_employee_account_posting();


-- 2) DIAGNOSTIC: recompute expected cash for a closed session using the
--    corrected math (excludes non-cash, includes mid-shift transfers).
--    READ ONLY — returns the corrected numbers, does not mutate anything.
CREATE OR REPLACE FUNCTION public.diagnose_pos_session_variance(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session pos_sessions%ROWTYPE;
  v_ils_cash_sales NUMERIC := 0;
  v_cash_expenses NUMERIC := 0;
  v_cash_purchases NUMERIC := 0;
  v_cash_returns NUMERIC := 0;
  v_transfers_out NUMERIC := 0;
  v_transfers_in NUMERIC := 0;
  v_foreign_change_ils NUMERIC := 0;
  v_expected_new NUMERIC;
  v_variance_new NUMERIC;
BEGIN
  SELECT * INTO v_session FROM pos_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','session not found');
  END IF;

  -- ILS cash sales only
  SELECT COALESCE(SUM(pp.amount),0) INTO v_ils_cash_sales
  FROM pos_payments pp
  JOIN pos_orders po ON po.id = pp.order_id
  WHERE po.session_id = p_session_id
    AND pp.payment_method = 'cash'
    AND COALESCE(pp.currency,'ILS') = 'ILS';

  -- Change given in ILS on foreign-currency sales
  SELECT COALESCE(SUM(pp.change_amount),0) INTO v_foreign_change_ils
  FROM pos_payments pp
  JOIN pos_orders po ON po.id = pp.order_id
  WHERE po.session_id = p_session_id
    AND pp.payment_method = 'cash'
    AND COALESCE(pp.currency,'ILS') <> 'ILS'
    AND COALESCE(pp.change_currency,'ILS') = 'ILS';

  -- Cash expenses / purchases in ILS
  SELECT COALESCE(SUM(amount),0) INTO v_cash_expenses
  FROM pos_expenses WHERE session_id = p_session_id AND COALESCE(payment_method,'cash')='cash';

  -- Cash refunds (returns) in ILS if table exists
  BEGIN
    EXECUTE 'SELECT COALESCE(SUM(amount),0) FROM public.returns WHERE session_id = $1 AND COALESCE(refund_method,''cash'')=''cash'''
      INTO v_cash_returns USING p_session_id;
  EXCEPTION WHEN OTHERS THEN v_cash_returns := 0;
  END;

  -- Mid-shift transfers (linked to session)
  SELECT COALESCE(SUM(amount),0) INTO v_transfers_out
  FROM cash_transfers WHERE pos_session_id = p_session_id AND from_cash_box_id = v_session.cash_box_id;

  SELECT COALESCE(SUM(amount),0) INTO v_transfers_in
  FROM cash_transfers WHERE pos_session_id = p_session_id AND to_cash_box_id = v_session.cash_box_id;

  v_expected_new := COALESCE(v_session.opening_cash,0)
                  + v_ils_cash_sales
                  - v_foreign_change_ils
                  - v_cash_expenses
                  - v_cash_returns
                  - v_transfers_out
                  + v_transfers_in;

  v_variance_new := COALESCE(v_session.closing_cash,0) - v_expected_new;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'cashier_name', v_session.cashier_name,
    'opened_at', v_session.opened_at,
    'closed_at', v_session.closed_at,
    'opening_cash', v_session.opening_cash,
    'closing_cash', v_session.closing_cash,
    'stored_expected', v_session.expected_cash,
    'stored_variance', v_session.cash_variance,
    'recomputed_expected', ROUND(v_expected_new::numeric, 2),
    'recomputed_variance', ROUND(v_variance_new::numeric, 2),
    'delta_variance', ROUND((v_variance_new - COALESCE(v_session.cash_variance,0))::numeric, 2),
    'breakdown', jsonb_build_object(
      'ils_cash_sales', v_ils_cash_sales,
      'foreign_change_ils', v_foreign_change_ils,
      'cash_expenses', v_cash_expenses,
      'cash_returns', v_cash_returns,
      'transfers_out', v_transfers_out,
      'transfers_in', v_transfers_in
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_pos_session_variance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_pos_session_variance(uuid) TO service_role;


-- 3) DIAGNOSTIC: list sessions where corrected variance differs from stored
--    variance, so we can identify unfair deductions. READ ONLY.
CREATE OR REPLACE FUNCTION public.diagnose_pos_variance_range(p_user_id uuid, p_days int DEFAULT 60)
RETURNS TABLE(
  session_id uuid,
  cashier_name text,
  closed_at timestamptz,
  stored_variance numeric,
  recomputed_variance numeric,
  delta numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id,
         s.cashier_name,
         s.closed_at,
         s.cash_variance,
         ((public.diagnose_pos_session_variance(s.id))->>'recomputed_variance')::numeric,
         ((public.diagnose_pos_session_variance(s.id))->>'delta_variance')::numeric
  FROM pos_sessions s
  WHERE s.state = 'closed'
    AND s.user_id = p_user_id
    AND s.closed_at > now() - (p_days || ' days')::interval
  ORDER BY ABS(((public.diagnose_pos_session_variance(s.id))->>'delta_variance')::numeric) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.diagnose_pos_variance_range(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_pos_variance_range(uuid, int) TO service_role;


-- 4) DIAGNOSTIC: list orphaned employee_account postings landing on 11300000
CREATE OR REPLACE FUNCTION public.list_orphaned_employee_account_posts(p_user_id uuid)
RETURNS TABLE(
  transaction_id uuid,
  transaction_date date,
  order_id uuid,
  order_number text,
  amount numeric,
  debit_account_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.transaction_date, po.id, po.order_number, t.amount, t.debit_account_code
  FROM pos_payments pp
  JOIN pos_orders po ON po.id = pp.order_id
  JOIN transactions t ON t.pos_order_id = pp.order_id
  WHERE pp.payment_method = 'employee_account'
    AND t.debit_account_code = '11300000'
    AND t.user_id = p_user_id
    AND NOT t.is_deleted
  ORDER BY t.transaction_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_orphaned_employee_account_posts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphaned_employee_account_posts(uuid) TO service_role;