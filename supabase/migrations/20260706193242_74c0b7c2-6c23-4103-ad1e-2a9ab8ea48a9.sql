
DO $$
DECLARE
  r record;
  v_canonical text;
  v_pre_balance numeric;
  v_post_balance numeric;
  v_all_codes text[];
  v_obsolete_codes text[];
  v_user uuid;
  v_total integer := 0;
BEGIN
  ALTER TABLE public.transactions DISABLE TRIGGER USER;

  FOR r IN
    SELECT c.id AS contact_id, c.user_id, c.contact_name, c.linked_account_code AS canonical,
           ARRAY(
             SELECT DISTINCT code FROM (
               SELECT unnest(ARRAY[t.debit_account_code, t.credit_account_code]) AS code
               FROM transactions t
               WHERE t.contact_id=c.id AND t.is_deleted=false
             ) sub
             WHERE code ~ '^(113|211)'
           ) AS used_codes
    FROM contacts c
    WHERE c.contact_type IN ('عميل ومورد','customer_supplier')
  LOOP
    v_canonical := r.canonical;
    v_user := r.user_id;
    v_all_codes := r.used_codes;
    v_obsolete_codes := ARRAY(SELECT unnest(v_all_codes) EXCEPT SELECT v_canonical);

    IF array_length(v_obsolete_codes,1) IS NULL THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(CASE WHEN t.debit_account_code = ANY(v_all_codes) THEN t.amount ELSE 0 END),0)
         - COALESCE(SUM(CASE WHEN t.credit_account_code = ANY(v_all_codes) THEN t.amount ELSE 0 END),0)
    INTO v_pre_balance
    FROM transactions t
    WHERE t.user_id=v_user AND t.contact_id=r.contact_id AND t.is_deleted=false
      AND (t.debit_account_code = ANY(v_all_codes) OR t.credit_account_code = ANY(v_all_codes));

    UPDATE public.transactions SET debit_account_code = v_canonical
      WHERE user_id=v_user AND contact_id=r.contact_id AND debit_account_code = ANY(v_obsolete_codes);
    UPDATE public.transactions SET credit_account_code = v_canonical
      WHERE user_id=v_user AND contact_id=r.contact_id AND credit_account_code = ANY(v_obsolete_codes);

    SELECT COALESCE(SUM(CASE WHEN t.debit_account_code = v_canonical THEN t.amount ELSE 0 END),0)
         - COALESCE(SUM(CASE WHEN t.credit_account_code = v_canonical THEN t.amount ELSE 0 END),0)
    INTO v_post_balance
    FROM transactions t
    WHERE t.user_id=v_user AND t.contact_id=r.contact_id AND t.is_deleted=false
      AND (t.debit_account_code = v_canonical OR t.credit_account_code = v_canonical);

    IF ABS(v_pre_balance - v_post_balance) > 0.005 THEN
      RAISE EXCEPTION 'Drift on % (%): pre=% post=%', r.contact_id, r.contact_name, v_pre_balance, v_post_balance;
    END IF;

    UPDATE public.accounts
      SET is_active=false,
          account_name = account_name || ' (مدمج → ' || v_canonical || ')'
      WHERE user_id=v_user
        AND account_code = ANY(v_obsolete_codes)
        AND is_active=true
        AND NOT EXISTS (
          SELECT 1 FROM transactions t2
          WHERE t2.user_id=v_user
            AND (t2.debit_account_code=accounts.account_code OR t2.credit_account_code=accounts.account_code)
            AND t2.is_deleted=false
        );

    INSERT INTO finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, new_value, reason)
    VALUES ('hybrid_unification_20260706_phase2','contact_account_merge_orphan',r.contact_id,
            jsonb_build_object('accounts', v_all_codes, 'pre_balance', v_pre_balance),
            jsonb_build_object('canonical', v_canonical, 'obsolete', v_obsolete_codes, 'post_balance', v_post_balance),
            'Merged orphan sub-accounts (linked only via transactions.contact_id)');

    v_total := v_total + 1;
  END LOOP;

  ALTER TABLE public.transactions ENABLE TRIGGER USER;
  RAISE NOTICE 'Phase 2 complete: %', v_total;
END $$;
