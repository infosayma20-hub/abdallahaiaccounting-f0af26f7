
-- =============================================================
-- POS Reconciliation Phase 3-5
-- Safe, additive RPCs. No changes to existing posted transactions
-- happen automatically — every fix is invoked explicitly by the
-- accountant from POSVarianceReviewPage.
-- =============================================================

-- List employee sub-accounts (218xx) for a tenant, plus their linked employee (if any).
CREATE OR REPLACE FUNCTION public.list_employee_receivable_accounts(p_user_id uuid)
RETURNS TABLE(account_code text, account_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT account_code, account_name
  FROM accounts
  WHERE user_id = p_user_id
    AND account_code LIKE '218%'
    AND is_active
  ORDER BY account_name;
$$;

-- Reroute a single orphaned employee_account transaction:
-- moves debit from 11300000 (or any wrong AR) to the correct employee
-- sub-account. Preserves the credit side (revenue 4100). Fully audited.
CREATE OR REPLACE FUNCTION public.reroute_orphaned_employee_account_post(
  p_transaction_id uuid,
  p_new_debit_account_code text,
  p_actor_user_id uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_txn transactions%ROWTYPE;
  v_new_account_id uuid;
  v_new_account_name text;
BEGIN
  SELECT * INTO v_txn FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','transaction not found'); END IF;
  IF v_txn.is_deleted THEN RETURN jsonb_build_object('success',false,'error','transaction is deleted'); END IF;
  IF v_txn.debit_account_code NOT IN ('11300000') THEN
    RETURN jsonb_build_object('success',false,'error','only orphaned 11300000 posts are eligible');
  END IF;
  IF p_new_debit_account_code NOT LIKE '218%' THEN
    RETURN jsonb_build_object('success',false,'error','target must be an employee sub-account (218xx)');
  END IF;

  SELECT id, account_name INTO v_new_account_id, v_new_account_name
  FROM accounts WHERE user_id = v_txn.user_id AND account_code = p_new_debit_account_code
  LIMIT 1;
  IF v_new_account_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','target account not found for tenant');
  END IF;

  UPDATE transactions
     SET debit_account_code = p_new_debit_account_code,
         account_id_debit = v_new_account_id,
         notes = COALESCE(notes,'') ||
           E'\n[reroute ' || to_char(now(),'YYYY-MM-DD HH24:MI') ||
           '] 11300000 → ' || p_new_debit_account_code ||
           ' (' || v_new_account_name || ')' ||
           CASE WHEN p_note IS NOT NULL THEN ' — ' || p_note ELSE '' END,
         updated_at = now()
   WHERE id = p_transaction_id;

  BEGIN
    INSERT INTO activity_log(user_id, action, entity_type, entity_id, details, created_at)
    VALUES (p_actor_user_id, 'pos_orphan_reroute', 'transaction', p_transaction_id,
      jsonb_build_object(
        'from_account','11300000',
        'to_account', p_new_debit_account_code,
        'to_name', v_new_account_name,
        'amount', v_txn.amount,
        'pos_order_id', v_txn.pos_order_id,
        'note', p_note
      ), now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success',true,
    'transaction_id', p_transaction_id,
    'new_account_code', p_new_debit_account_code,
    'new_account_name', v_new_account_name);
END $$;

REVOKE ALL ON FUNCTION public.reroute_orphaned_employee_account_post(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reroute_orphaned_employee_account_post(uuid,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_employee_receivable_accounts(uuid) TO authenticated;

-- Recompute and update a session's stored variance so future reports and
-- HR deductions use the corrected number. Does NOT reverse any prior
-- accounting entries — accountant reviews the delta and posts a manual
-- adjustment if needed. Fully audited.
CREATE OR REPLACE FUNCTION public.reconcile_pos_session_variance(
  p_session_id uuid,
  p_actor_user_id uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  v_diag jsonb;
  v_recomputed numeric;
  v_expected numeric;
  v_old_variance numeric;
  v_old_expected numeric;
  v_session pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM pos_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','session not found'); END IF;
  IF v_session.state <> 'closed' THEN
    RETURN jsonb_build_object('success',false,'error','session is not closed');
  END IF;

  v_diag := public.diagnose_pos_session_variance(p_session_id);
  v_recomputed := (v_diag->>'variance_new')::numeric;
  v_expected   := (v_diag->>'expected_new')::numeric;
  v_old_variance := v_session.cash_variance;
  v_old_expected := v_session.expected_cash;

  IF v_recomputed IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','recompute failed', 'diag', v_diag);
  END IF;

  UPDATE pos_sessions
     SET expected_cash = v_expected,
         cash_variance = v_recomputed,
         notes = COALESCE(notes,'') ||
           E'\n[reconcile ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] variance ' ||
           COALESCE(v_old_variance::text,'—') || ' → ' || v_recomputed::text ||
           CASE WHEN p_note IS NOT NULL THEN ' — ' || p_note ELSE '' END,
         updated_at = now()
   WHERE id = p_session_id;

  -- Mirror the corrected numbers into the shift audit row if it exists.
  UPDATE pos_shift_audits
     SET expected_cash_ils = v_expected,
         variance_ils = v_recomputed,
         variance_total_ils = v_recomputed
             + COALESCE(variance_usd,0)*0    -- USD/JOD variance untouched
             + COALESCE(variance_jod,0)*0,
         accountant_notes = COALESCE(accountant_notes,'') ||
           E'\n[reconcile ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] variance updated: ' ||
           COALESCE(v_old_variance::text,'—') || ' → ' || v_recomputed::text,
         updated_at = now()
   WHERE session_id = p_session_id;

  BEGIN
    INSERT INTO activity_log(user_id, action, entity_type, entity_id, details, created_at)
    VALUES (p_actor_user_id, 'pos_variance_reconcile', 'pos_session', p_session_id,
      jsonb_build_object(
        'old_variance', v_old_variance,
        'new_variance', v_recomputed,
        'old_expected', v_old_expected,
        'new_expected', v_expected,
        'delta', v_recomputed - COALESCE(v_old_variance,0),
        'note', p_note,
        'diag', v_diag
      ), now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'old_variance', v_old_variance,
    'new_variance', v_recomputed,
    'delta', v_recomputed - COALESCE(v_old_variance,0));
END $$;

REVOKE ALL ON FUNCTION public.reconcile_pos_session_variance(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_pos_session_variance(uuid,uuid,text) TO authenticated;

-- Sessions opened while the cash box already held cash (float likely
-- unrecorded). Read-only diagnostic to surface phantom-surplus cases.
CREATE OR REPLACE FUNCTION public.diagnose_pos_zero_float_sessions(p_user_id uuid, p_days int DEFAULT 90)
RETURNS TABLE(
  session_id uuid,
  cashier_name text,
  opened_at timestamptz,
  closed_at timestamptz,
  opening_cash numeric,
  cash_variance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$
  SELECT id, cashier_name, opened_at, closed_at, opening_cash, cash_variance
  FROM pos_sessions
  WHERE user_id = p_user_id
    AND state = 'closed'
    AND COALESCE(opening_cash,0) = 0
    AND COALESCE(cash_variance,0) > 100  -- surplus > 100 suggests float wasn't logged
    AND opened_at >= now() - (p_days || ' days')::interval
  ORDER BY opened_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.diagnose_pos_zero_float_sessions(uuid,int) TO authenticated;
