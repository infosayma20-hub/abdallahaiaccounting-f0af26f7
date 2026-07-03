
DO $$
DECLARE
  v_batch TEXT := 'contact_account_unify_2026_07';
  v_name_updates INT := 0;
  v_name_skipped INT := 0;
  v_tx_updates INT := 0;
BEGIN
  -- Build candidates
  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT c.id AS contact_id,
         c.user_id,
         c.contact_name AS old_name,
         a.account_name AS new_name,
         c.linked_account_code
    FROM public.contacts c
    JOIN public.accounts a
      ON a.account_code = c.linked_account_code
     AND a.user_id = c.user_id
   WHERE c.linked_account_code IS NOT NULL
     AND c.contact_name IS DISTINCT FROM a.account_name;

  -- Mark conflicts:
  --  (1) another CONTACT (not in cand) already has that name in same tenant
  --  (2) OR multiple candidates target the same (user_id, new_name) -> keep none of them safely
  ALTER TABLE _cand ADD COLUMN has_conflict BOOLEAN NOT NULL DEFAULT FALSE;

  UPDATE _cand SET has_conflict = TRUE
   WHERE EXISTS (
     SELECT 1 FROM public.contacts c2
      WHERE c2.user_id = _cand.user_id
        AND c2.contact_name = _cand.new_name
        AND c2.id <> _cand.contact_id
   );

  UPDATE _cand SET has_conflict = TRUE
   WHERE (user_id, new_name) IN (
     SELECT user_id, new_name FROM _cand
      GROUP BY user_id, new_name HAVING COUNT(*) > 1
   );

  -- Log all candidates (renamed or skipped)
  INSERT INTO public.finance_integrity_fix_log
    (fix_batch, entity_type, entity_id, old_value, new_value, reason)
  SELECT v_batch,
         CASE WHEN has_conflict THEN 'contact_name_sync_skipped' ELSE 'contact_name_sync' END,
         contact_id,
         jsonb_build_object('contact_name', old_name),
         jsonb_build_object('contact_name', new_name, 'linked_account_code', linked_account_code),
         CASE WHEN has_conflict
              THEN 'Phase A: skipped due to duplicate contact_name'
              ELSE 'Phase A: unify contact_name with linked account_name' END
    FROM _cand;

  UPDATE public.contacts c
     SET contact_name = nc.new_name
    FROM _cand nc
   WHERE c.id = nc.contact_id
     AND NOT nc.has_conflict;
  GET DIAGNOSTICS v_name_updates = ROW_COUNT;

  SELECT COUNT(*) INTO v_name_skipped FROM _cand WHERE has_conflict;
  RAISE NOTICE 'Phase A: % renamed, % skipped', v_name_updates, v_name_skipped;

  -- PHASE B: reroute transactions
  WITH candidates AS (
    SELECT t.id AS tx_id,
           t.debit_account_code AS old_debit,
           t.credit_account_code AS old_credit,
           CASE WHEN t.debit_account_code = child.parent_code
                 AND t.debit_account_code <> child.account_code
                THEN child.account_code ELSE t.debit_account_code END AS new_debit,
           CASE WHEN t.credit_account_code = child.parent_code
                 AND t.credit_account_code <> child.account_code
                THEN child.account_code ELSE t.credit_account_code END AS new_credit,
           child.account_code AS child_code,
           child.parent_code  AS parent_code,
           c.id AS contact_id
    FROM public.transactions t
    JOIN public.contacts c  ON c.id = t.contact_id
    JOIN public.accounts child
      ON child.account_code = c.linked_account_code
     AND child.user_id = c.user_id
    WHERE c.linked_account_code IS NOT NULL
      AND (
            (t.debit_account_code  = child.parent_code AND t.debit_account_code  <> child.account_code)
         OR (t.credit_account_code = child.parent_code AND t.credit_account_code <> child.account_code)
          )
  ),
  logged AS (
    INSERT INTO public.finance_integrity_fix_log
      (fix_batch, entity_type, entity_id, old_value, new_value, reason)
    SELECT v_batch, 'transaction_reroute', tx_id,
           jsonb_build_object('debit_account_code', old_debit, 'credit_account_code', old_credit),
           jsonb_build_object('debit_account_code', new_debit, 'credit_account_code', new_credit,
                              'child_code', child_code, 'parent_code', parent_code,
                              'contact_id', contact_id),
           'Phase B: redirect posting from parent to linked sub-account'
    FROM candidates
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_tx_updates FROM logged;

  UPDATE public.transactions t
     SET debit_account_code  = CASE WHEN t.debit_account_code = child.parent_code
                                     AND t.debit_account_code <> child.account_code
                                    THEN child.account_code ELSE t.debit_account_code END,
         credit_account_code = CASE WHEN t.credit_account_code = child.parent_code
                                     AND t.credit_account_code <> child.account_code
                                    THEN child.account_code ELSE t.credit_account_code END
    FROM public.contacts c,
         public.accounts child
   WHERE c.id = t.contact_id
     AND child.account_code = c.linked_account_code
     AND child.user_id = c.user_id
     AND c.linked_account_code IS NOT NULL
     AND (
           (t.debit_account_code  = child.parent_code AND t.debit_account_code  <> child.account_code)
        OR (t.credit_account_code = child.parent_code AND t.credit_account_code <> child.account_code)
         );

  RAISE NOTICE 'Phase B: % transactions rerouted', v_tx_updates;
END $$;

-- PHASE C: guard trigger for future postings
CREATE OR REPLACE FUNCTION public.trg_transactions_reroute_parent_to_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked TEXT;
  v_parent TEXT;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.linked_account_code INTO v_linked
    FROM public.contacts c WHERE c.id = NEW.contact_id;
  IF v_linked IS NULL THEN RETURN NEW; END IF;

  SELECT a.parent_code INTO v_parent
    FROM public.accounts a
   WHERE a.account_code = v_linked AND a.user_id = NEW.user_id
   LIMIT 1;
  IF v_parent IS NULL THEN RETURN NEW; END IF;

  IF NEW.debit_account_code = v_parent AND NEW.debit_account_code <> v_linked THEN
    NEW.debit_account_code := v_linked;
  END IF;
  IF NEW.credit_account_code = v_parent AND NEW.credit_account_code <> v_linked THEN
    NEW.credit_account_code := v_linked;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_transactions_reroute_parent ON public.transactions;
CREATE TRIGGER trg_transactions_reroute_parent
  BEFORE INSERT OR UPDATE OF debit_account_code, credit_account_code, contact_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_transactions_reroute_parent_to_child();
