
DO $$
DECLARE
  v_batch TEXT := 'contact_account_unify_2026_07_phase2';
  v_tenant UUID := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_next_num BIGINT;
  v_new_code TEXT;
  v_new_name TEXT;
  v_tx_rerouted INT := 0;
  r RECORD;
BEGIN
  -- Determine next sub-account number under 2110
  SELECT COALESCE(MAX(account_code::bigint), 21100000) + 1
    INTO v_next_num
    FROM public.accounts
   WHERE user_id = v_tenant
     AND parent_code = '2110'
     AND account_code ~ '^2110[0-9]+$';

  -- Iterate over the 9 suppliers currently linked to 2111
  FOR r IN
    SELECT id, contact_name
      FROM public.contacts
     WHERE user_id = v_tenant
       AND linked_account_code = '2111'
     ORDER BY contact_name
  LOOP
    v_new_code := v_next_num::text;
    v_new_name := 'ذمة مورد ' || r.contact_name;

    -- Guarantee unique account_name within tenant
    IF EXISTS (SELECT 1 FROM public.accounts
                WHERE user_id = v_tenant AND account_name = v_new_name) THEN
      v_new_name := v_new_name || ' - ' || v_new_code;
    END IF;

    -- Guarantee unique contact_name within tenant
    IF EXISTS (SELECT 1 FROM public.contacts
                WHERE user_id = v_tenant AND contact_name = v_new_name AND id <> r.id) THEN
      v_new_name := v_new_name || ' - ' || v_new_code;
    END IF;

    INSERT INTO public.accounts
      (user_id, account_code, account_name, account_type, parent_code, currency, nature, is_active)
    VALUES
      (v_tenant, v_new_code, v_new_name, 'فرعي', '2110', 'شيكل', 'credit', TRUE);

    -- Reroute existing transactions from 2111 -> new sub-account (for THIS contact only)
    WITH tx AS (
      UPDATE public.transactions t
         SET debit_account_code  = CASE WHEN t.debit_account_code  = '2111' THEN v_new_code ELSE t.debit_account_code END,
             credit_account_code = CASE WHEN t.credit_account_code = '2111' THEN v_new_code ELSE t.credit_account_code END
       WHERE t.contact_id = r.id
         AND (t.debit_account_code = '2111' OR t.credit_account_code = '2111')
       RETURNING t.id
    )
    SELECT COUNT(*) INTO v_tx_rerouted FROM tx;

    -- Update contact link + name
    UPDATE public.contacts
       SET linked_account_code = v_new_code,
           contact_name        = v_new_name
     WHERE id = r.id;

    INSERT INTO public.finance_integrity_fix_log
      (fix_batch, entity_type, entity_id, old_value, new_value, reason)
    VALUES
      (v_batch, 'supplier_split_from_2111', r.id,
       jsonb_build_object('contact_name', r.contact_name, 'linked_account_code', '2111'),
       jsonb_build_object('contact_name', v_new_name, 'linked_account_code', v_new_code,
                          'transactions_rerouted', v_tx_rerouted),
       'Phase 2: created own sub-account under 2110 and rerouted transactions from 2111');

    v_next_num := v_next_num + 1;
  END LOOP;

  -- Fix the 2 remaining customer name mismatches (اسيد + ضياء)
  UPDATE public.contacts c
     SET contact_name = a.account_name
    FROM public.accounts a
   WHERE c.user_id = v_tenant
     AND a.user_id = v_tenant
     AND a.account_code = c.linked_account_code
     AND c.linked_account_code IS NOT NULL
     AND c.contact_name IS DISTINCT FROM a.account_name
     AND NOT EXISTS (
       SELECT 1 FROM public.contacts c2
        WHERE c2.user_id = v_tenant
          AND c2.contact_name = a.account_name
          AND c2.id <> c.id
     );

  INSERT INTO public.finance_integrity_fix_log
    (fix_batch, entity_type, entity_id, old_value, new_value, reason)
  SELECT v_batch, 'contact_name_sync_retry', c.id,
         jsonb_build_object('contact_name', c.contact_name),
         jsonb_build_object('contact_name', a.account_name, 'linked_account_code', c.linked_account_code),
         'Phase 2: retried name sync after clearing conflicts'
    FROM public.contacts c
    JOIN public.accounts a ON a.account_code = c.linked_account_code AND a.user_id = c.user_id
   WHERE c.user_id = v_tenant AND c.contact_name = a.account_name
     AND c.id IN ('4cd8711a-6e69-452d-905e-57fc70c5561d','e5d659e6-ad77-4dfc-a2c8-3c29027c704e');
END $$;
