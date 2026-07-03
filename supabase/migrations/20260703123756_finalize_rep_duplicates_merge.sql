-- ============================================================================
-- Phase 3 (final): Merge remaining rep-duplicate accounts for tenant 6fb3...
-- Safe: redirects transactions from 1130-REP-* to 21100xxx (same contact_id).
-- All redirects logged to finance_integrity_fix_log with rollback batch id.
-- ============================================================================

DO $$
DECLARE
  v_batch text := 'rep_merge_' || to_char(now(),'YYYYMMDD_HH24MISS');
  v_uid uuid := '6fb346d9-f8a6-44a7-a99c-fd2b440f6060';
  r record;
  v_redirected int := 0;
BEGIN
  -- Pairs to merge: (old_1130_code, new_2110_code)
  FOR r IN
    SELECT '1130-REP-001'::text AS old_code, '21100006'::text AS new_code
    UNION ALL SELECT '1130-REP-002', '21100007'
  LOOP
    -- Log all transactions being redirected (debit side)
    INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
    SELECT v_batch, 'transaction.debit_account_code', t.id,
           jsonb_build_object('debit_account_code', r.old_code, 'amount', t.amount),
           jsonb_build_object('debit_account_code', r.new_code),
           'Merge duplicate rep account (1130-REP → 21100xx)', now()
    FROM transactions t
    WHERE t.user_id = v_uid AND t.debit_account_code = r.old_code AND t.is_deleted = false;

    UPDATE transactions SET debit_account_code = r.new_code, updated_at = now()
     WHERE user_id = v_uid AND debit_account_code = r.old_code AND is_deleted = false;
    GET DIAGNOSTICS v_redirected = ROW_COUNT;
    RAISE NOTICE 'Redirected % debit tx: % → %', v_redirected, r.old_code, r.new_code;

    -- Log all transactions being redirected (credit side)
    INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
    SELECT v_batch, 'transaction.credit_account_code', t.id,
           jsonb_build_object('credit_account_code', r.old_code, 'amount', t.amount),
           jsonb_build_object('credit_account_code', r.new_code),
           'Merge duplicate rep account (1130-REP → 21100xx)', now()
    FROM transactions t
    WHERE t.user_id = v_uid AND t.credit_account_code = r.old_code AND t.is_deleted = false;

    UPDATE transactions SET credit_account_code = r.new_code, updated_at = now()
     WHERE user_id = v_uid AND credit_account_code = r.old_code AND is_deleted = false;
    GET DIAGNOSTICS v_redirected = ROW_COUNT;
    RAISE NOTICE 'Redirected % credit tx: % → %', v_redirected, r.old_code, r.new_code;

    -- Deactivate the old 1130 duplicate (do NOT delete — audit trail)
    UPDATE accounts SET is_active = false,
                        notes = coalesce(notes,'') || ' [merged into ' || r.new_code || ' on ' || now()::text || ']',
                        updated_at = now()
     WHERE user_id = v_uid AND account_code = r.old_code;

    INSERT INTO finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_at)
    VALUES (v_batch, 'account.deactivate', NULL,
            jsonb_build_object('account_code', r.old_code, 'is_active', true),
            jsonb_build_object('account_code', r.old_code, 'is_active', false, 'merged_into', r.new_code),
            'Duplicate rep account deactivated after merge', now());
  END LOOP;
END $$;
