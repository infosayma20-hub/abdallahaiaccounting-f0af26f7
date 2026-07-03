
CREATE OR REPLACE FUNCTION public.trg_transactions_reroute_parent_to_child()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_linked TEXT; v_parent TEXT; v_ctype TEXT; v_correct_parent TEXT;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT c.linked_account_code, c.contact_type INTO v_linked, v_ctype
    FROM public.contacts c WHERE c.id = NEW.contact_id AND c.user_id = NEW.user_id;
  IF v_linked IS NULL THEN RETURN NEW; END IF;

  SELECT a.parent_code INTO v_parent
    FROM public.accounts a
    WHERE a.account_code = v_linked AND a.user_id = NEW.user_id LIMIT 1;
  IF v_parent IS NULL THEN RETURN NEW; END IF;

  -- Standard reroute: parent → linked leaf
  IF NEW.debit_account_code = v_parent AND NEW.debit_account_code <> v_linked THEN
    NEW.debit_account_code := v_linked;
  END IF;
  IF NEW.credit_account_code = v_parent AND NEW.credit_account_code <> v_linked THEN
    NEW.credit_account_code := v_linked;
  END IF;

  -- NEW: If debit/credit is on the wrong AR/AP root for this contact_type, redirect
  v_correct_parent := CASE
    WHEN v_ctype IN ('مورد','supplier','vendor') THEN '2110'
    WHEN v_ctype IN ('عميل','customer','client') THEN '1130'
    WHEN v_ctype IN ('موظف','employee') THEN '2180'
    ELSE NULL
  END;

  IF v_correct_parent IS NOT NULL THEN
    -- If debit is on wrong root or wrong parent of it, swap to linked
    IF NEW.debit_account_code IN ('1130','2110') 
       AND NEW.debit_account_code <> v_correct_parent 
       AND v_linked LIKE (v_correct_parent || '%') THEN
      NEW.debit_account_code := v_linked;
    END IF;
    IF NEW.credit_account_code IN ('1130','2110')
       AND NEW.credit_account_code <> v_correct_parent
       AND v_linked LIKE (v_correct_parent || '%') THEN
      NEW.credit_account_code := v_linked;
    END IF;
  END IF;

  RETURN NEW;
END $function$;
