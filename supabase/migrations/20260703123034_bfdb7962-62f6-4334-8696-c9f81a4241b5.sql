
CREATE OR REPLACE FUNCTION public.repair_contact_accounts_for_tenant(
  p_user_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS TABLE(
  action text,
  entity text,
  before_value text,
  after_value text,
  affected_rows integer,
  amount numeric,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch text := 'contact_repair_' || to_char(now(),'YYYYMMDDHH24MISS') || '_' || SUBSTRING(p_user_id::text,1,8);
  v_contact record;
  v_target_parent text;
  v_target_code text;
  v_ar_code text;
  v_moved int;
  v_amt numeric;
  v_tx record;
  v_new_code text;
BEGIN
  FOR v_contact IN
    SELECT c.id, c.contact_name, c.contact_type, c.linked_account_code
    FROM public.contacts c
    WHERE c.user_id = p_user_id
      AND c.is_active
      AND c.linked_account_code IS NOT NULL
      AND (
        (c.contact_type IN ('مورد','supplier','vendor') AND c.linked_account_code LIKE '113%')
        OR (c.contact_type IN ('عميل','customer','client') AND c.linked_account_code LIKE '211%')
      )
  LOOP
    v_target_parent := CASE
      WHEN v_contact.contact_type IN ('مورد','supplier','vendor') THEN '2110'
      WHEN v_contact.contact_type IN ('عميل','customer','client') THEN '1130'
    END;

    v_ar_code := v_contact.linked_account_code;

    SELECT account_code INTO v_target_code
    FROM public.accounts
    WHERE user_id = p_user_id
      AND parent_code = v_target_parent
      AND (contact_id = v_contact.id OR account_name = v_contact.contact_name)
      AND is_active
    ORDER BY (contact_id = v_contact.id) DESC NULLS LAST
    LIMIT 1;

    IF v_target_code IS NULL THEN
      IF NOT p_dry_run THEN
        v_target_code := public.resolve_postable_account(
          p_user_id, v_target_parent, v_contact.id, v_contact.contact_name, v_contact.contact_type
        );
      ELSE
        v_target_code := v_target_parent || '(new)';
      END IF;
    END IF;

    SELECT COUNT(*), COALESCE(SUM(t.amount),0) INTO v_moved, v_amt
    FROM public.transactions t
    WHERE t.user_id = p_user_id AND NOT t.is_deleted
      AND (t.debit_account_code = v_ar_code OR t.credit_account_code = v_ar_code);

    IF NOT p_dry_run THEN
      UPDATE public.transactions SET debit_account_code = v_target_code
      WHERE user_id = p_user_id AND debit_account_code = v_ar_code AND NOT is_deleted;

      UPDATE public.transactions SET credit_account_code = v_target_code
      WHERE user_id = p_user_id AND credit_account_code = v_ar_code AND NOT is_deleted;

      UPDATE public.transactions SET contact_id = v_contact.id
      WHERE user_id = p_user_id AND contact_id IS NULL AND NOT is_deleted
        AND (debit_account_code = v_target_code OR credit_account_code = v_target_code)
        AND (description ILIKE '%' || v_contact.contact_name || '%');

      UPDATE public.contacts SET linked_account_code = v_target_code
      WHERE id = v_contact.id AND user_id = p_user_id;

      UPDATE public.accounts SET contact_id = v_contact.id
      WHERE user_id = p_user_id AND account_code = v_target_code AND contact_id IS NULL;

      UPDATE public.accounts
      SET is_active = false,
          notes = COALESCE(notes,'') || E'\n[REPAIRED ' || v_batch || '] merged into ' || v_target_code
      WHERE user_id = p_user_id AND account_code = v_ar_code AND COALESCE(is_system_protected,false)=false;

      INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason)
      VALUES (v_batch, 'contact_relink', v_contact.id,
        jsonb_build_object('linked_account_code', v_ar_code, 'contact_type', v_contact.contact_type),
        jsonb_build_object('linked_account_code', v_target_code, 'moved_transactions', v_moved, 'total_amount', v_amt),
        'Contact was linked to wrong root; moved to correct AR/AP sub-account');
    END IF;

    RETURN QUERY SELECT
      'fix_wrong_root'::text,
      v_contact.contact_name || ' (' || v_contact.contact_type || ')',
      v_ar_code,
      v_target_code,
      v_moved,
      v_amt,
      'Contact relinked; ' || v_moved || ' transactions rerouted';
  END LOOP;

  -- STEP 2: Reroute parent-root transactions with contact_id
  FOR v_tx IN
    SELECT t.id, t.contact_id, t.debit_account_code, t.credit_account_code, t.amount, t.reference
    FROM public.transactions t
    WHERE t.user_id = p_user_id AND NOT t.is_deleted
      AND t.contact_id IS NOT NULL
      AND (
        t.debit_account_code IN ('1130','2110','2180','1146')
        OR t.credit_account_code IN ('1130','2110','2180','1146')
      )
  LOOP
    IF v_tx.debit_account_code IN ('1130','2110','2180','1146') THEN
      IF NOT p_dry_run THEN
        BEGIN
          v_new_code := public.resolve_postable_account(
            p_user_id, v_tx.debit_account_code, v_tx.contact_id, NULL, NULL
          );
          IF v_new_code <> v_tx.debit_account_code THEN
            UPDATE public.transactions SET debit_account_code = v_new_code WHERE id = v_tx.id;
            INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason)
            VALUES (v_batch, 'tx_reroute_debit', v_tx.id,
              jsonb_build_object('debit_account_code', v_tx.debit_account_code, 'reference', v_tx.reference),
              jsonb_build_object('debit_account_code', v_new_code),
              'Parent-root debit rerouted to leaf sub-account');
          END IF;
        EXCEPTION WHEN OTHERS THEN v_new_code := NULL;
        END;
      ELSE
        v_new_code := NULL;
      END IF;
      RETURN QUERY SELECT 'reroute_debit'::text, v_tx.reference,
        v_tx.debit_account_code, COALESCE(v_new_code, v_tx.debit_account_code || '(unchanged)'),
        1, v_tx.amount, 'Debit rerouted to leaf';
    END IF;

    IF v_tx.credit_account_code IN ('1130','2110','2180','1146') THEN
      IF NOT p_dry_run THEN
        BEGIN
          v_new_code := public.resolve_postable_account(
            p_user_id, v_tx.credit_account_code, v_tx.contact_id, NULL, NULL
          );
          IF v_new_code <> v_tx.credit_account_code THEN
            UPDATE public.transactions SET credit_account_code = v_new_code WHERE id = v_tx.id;
            INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason)
            VALUES (v_batch, 'tx_reroute_credit', v_tx.id,
              jsonb_build_object('credit_account_code', v_tx.credit_account_code, 'reference', v_tx.reference),
              jsonb_build_object('credit_account_code', v_new_code),
              'Parent-root credit rerouted to leaf sub-account');
          END IF;
        EXCEPTION WHEN OTHERS THEN v_new_code := NULL;
        END;
      ELSE
        v_new_code := NULL;
      END IF;
      RETURN QUERY SELECT 'reroute_credit'::text, v_tx.reference,
        v_tx.credit_account_code, COALESCE(v_new_code, v_tx.credit_account_code || '(unchanged)'),
        1, v_tx.amount, 'Credit rerouted to leaf';
    END IF;
  END LOOP;

  -- STEP 3: Report txs on parent root without contact_id
  RETURN QUERY
  SELECT
    'MANUAL_REVIEW_NEEDED'::text,
    t.transaction_type || ' - ' || COALESCE(t.reference,'(no ref)'),
    CASE WHEN t.debit_account_code IN ('1130','2110','2180','1146') THEN t.debit_account_code ELSE t.credit_account_code END,
    NULL::text,
    1,
    t.amount,
    'No contact_id on transaction - cannot auto-reroute safely'
  FROM public.transactions t
  WHERE t.user_id = p_user_id AND NOT t.is_deleted
    AND t.contact_id IS NULL
    AND (t.debit_account_code IN ('1130','2110','2180','1146')
         OR t.credit_account_code IN ('1130','2110','2180','1146'));

  RETURN QUERY SELECT 'BATCH_ID'::text, v_batch, p_dry_run::text, 'complete'::text, 0, 0::numeric,
    CASE WHEN p_dry_run THEN 'DRY RUN - no changes applied' ELSE 'Changes committed' END;
END;
$function$;
