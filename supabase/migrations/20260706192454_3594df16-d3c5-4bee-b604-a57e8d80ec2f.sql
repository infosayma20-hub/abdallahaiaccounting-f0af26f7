
DO $$
DECLARE
  r record;
  v_canonical text;
  v_obsolete_codes text[];
  v_pre_balance numeric;
  v_post_balance numeric;
  v_rows_updated integer;
  v_user uuid;
  v_total_migrated integer := 0;
BEGIN
  -- Disable user triggers on transactions for this session so we can safely
  -- relabel account_code fields on historical (possibly fiscal-locked) rows.
  -- We ONLY change debit_account_code / credit_account_code — amount, contact_id,
  -- date, is_deleted are untouched.
  ALTER TABLE public.transactions DISABLE TRIGGER USER;

  FOR r IN
    SELECT
      c.id            AS contact_id,
      c.user_id       AS user_id,
      c.contact_name  AS contact_name,
      (ARRAY_AGG(a.account_code ORDER BY a.created_at ASC))[1] AS canonical_code,
      ARRAY_AGG(a.account_code ORDER BY a.created_at ASC) FILTER (WHERE true) AS all_codes
    FROM public.contacts c
    JOIN public.accounts a
      ON a.contact_id = c.id
     AND a.is_active
     AND (a.parent_code LIKE '113%' OR a.parent_code LIKE '211%')
    WHERE c.contact_type IN ('عميل ومورد','customer_supplier')
    GROUP BY c.id, c.user_id, c.contact_name
    HAVING COUNT(*) >= 2
  LOOP
    v_canonical := r.canonical_code;
    v_user := r.user_id;
    v_obsolete_codes := ARRAY(SELECT unnest(r.all_codes) EXCEPT SELECT v_canonical);

    -- Pre-balance = net debit across ALL of this contact's hybrid sub-accounts
    SELECT COALESCE(SUM(
      CASE WHEN t.debit_account_code = ANY(r.all_codes) THEN t.amount ELSE 0 END
    ),0)
    - COALESCE(SUM(
      CASE WHEN t.credit_account_code = ANY(r.all_codes) THEN t.amount ELSE 0 END
    ),0)
    INTO v_pre_balance
    FROM public.transactions t
    WHERE t.user_id = v_user
      AND t.is_deleted = false
      AND (t.debit_account_code = ANY(r.all_codes) OR t.credit_account_code = ANY(r.all_codes));

    -- Remap debit side
    UPDATE public.transactions
      SET debit_account_code = v_canonical
      WHERE user_id = v_user
        AND debit_account_code = ANY(v_obsolete_codes);
    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Remap credit side
    UPDATE public.transactions
      SET credit_account_code = v_canonical
      WHERE user_id = v_user
        AND credit_account_code = ANY(v_obsolete_codes);

    -- Post-balance on canonical only
    SELECT COALESCE(SUM(
      CASE WHEN t.debit_account_code = v_canonical THEN t.amount ELSE 0 END
    ),0)
    - COALESCE(SUM(
      CASE WHEN t.credit_account_code = v_canonical THEN t.amount ELSE 0 END
    ),0)
    INTO v_post_balance
    FROM public.transactions t
    WHERE t.user_id = v_user
      AND t.is_deleted = false
      AND (t.debit_account_code = v_canonical OR t.credit_account_code = v_canonical);

    IF ABS(v_pre_balance - v_post_balance) > 0.005 THEN
      RAISE EXCEPTION
        'Balance drift for contact % (%): pre=% post=%',
        r.contact_id, r.contact_name, v_pre_balance, v_post_balance;
    END IF;

    -- Sync linked_account_code
    UPDATE public.contacts
      SET linked_account_code = v_canonical
      WHERE id = r.contact_id;

    -- Deactivate obsolete accounts (archive, don't delete)
    UPDATE public.accounts
      SET is_active = false,
          account_name = account_name || ' (مدمج → ' || v_canonical || ')'
      WHERE user_id = v_user
        AND account_code = ANY(v_obsolete_codes);

    -- Audit log
    INSERT INTO public.finance_integrity_fix_log
      (fix_batch, entity_type, entity_id, old_value, new_value, reason)
    VALUES (
      'hybrid_unification_20260706',
      'contact_account_merge',
      r.contact_id,
      jsonb_build_object('accounts', r.all_codes, 'pre_balance', v_pre_balance),
      jsonb_build_object('canonical', v_canonical, 'obsolete', v_obsolete_codes, 'post_balance', v_post_balance),
      'Merged hybrid contact sub-accounts into oldest'
    );

    v_total_migrated := v_total_migrated + 1;
  END LOOP;

  ALTER TABLE public.transactions ENABLE TRIGGER USER;

  RAISE NOTICE 'Hybrid unification complete. Contacts merged: %', v_total_migrated;
END $$;
