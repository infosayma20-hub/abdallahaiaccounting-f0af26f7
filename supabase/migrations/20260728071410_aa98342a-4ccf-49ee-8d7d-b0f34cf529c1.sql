
-- 1) Fix the 5 mis-posted rows on Malaki (customer receipts routed to another customer's sub-ledger)
UPDATE public.transactions SET credit_account_code = '11300002'
 WHERE id = 'fa3dd91e-fb7c-4cf6-aca5-083e57c87fdd' AND credit_account_code = '11300001';

UPDATE public.transactions SET credit_account_code = '11300002'
 WHERE id = 'f214bf5b-b87a-40e7-8cc0-29685e20fbe9' AND credit_account_code = '11300001';

UPDATE public.transactions SET credit_account_code = '11300003'
 WHERE id = '80a2e683-ef69-410e-81b7-8ab080d4b153' AND credit_account_code = '11300001';

UPDATE public.transactions SET credit_account_code = '11300002'
 WHERE id = '63c8b0a5-1f62-4dec-afa9-d69ef167421a' AND credit_account_code = '11300001';

UPDATE public.transactions SET debit_account_code = '11300002'
 WHERE id = '860187cd-f208-4a79-a91f-82e4f0af6004' AND debit_account_code = '11300001';

-- 2) Guardian: never let a receipt/payment tied to a contact land on another contact's AR/AP leaf.
--    If contact has linked_account_code and one side is a customer/supplier code (113* / 212*)
--    that doesn't match, auto-align it to the contact's own sub-account.
CREATE OR REPLACE FUNCTION public.enforce_contact_subledger_alignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked TEXT;
BEGIN
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT linked_account_code INTO linked
  FROM public.contacts
  WHERE id = NEW.contact_id;

  IF linked IS NULL OR linked = '' THEN
    RETURN NEW;
  END IF;

  -- Credit side: customer (113*) or supplier (212*)
  IF NEW.credit_account_code IS NOT NULL
     AND (NEW.credit_account_code LIKE '113%' OR NEW.credit_account_code LIKE '212%')
     AND NEW.credit_account_code <> linked
     AND (linked LIKE '113%' OR linked LIKE '212%')
     AND left(NEW.credit_account_code, 3) = left(linked, 3)
  THEN
    NEW.credit_account_code := linked;
  END IF;

  -- Debit side: customer (113*) or supplier (212*)
  IF NEW.debit_account_code IS NOT NULL
     AND (NEW.debit_account_code LIKE '113%' OR NEW.debit_account_code LIKE '212%')
     AND NEW.debit_account_code <> linked
     AND (linked LIKE '113%' OR linked LIKE '212%')
     AND left(NEW.debit_account_code, 3) = left(linked, 3)
  THEN
    NEW.debit_account_code := linked;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_contact_subledger_alignment ON public.transactions;
CREATE TRIGGER trg_enforce_contact_subledger_alignment
BEFORE INSERT OR UPDATE OF contact_id, debit_account_code, credit_account_code
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contact_subledger_alignment();
