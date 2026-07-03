
CREATE OR REPLACE FUNCTION public.enforce_contact_account_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parents CONSTANT text[] := ARRAY['1130','2110','2180','1146'];
  v_resolved text;
BEGIN
  -- Debit side
  IF NEW.debit_account_code = ANY(v_parents) AND NEW.contact_id IS NOT NULL THEN
    BEGIN
      v_resolved := public.resolve_postable_account(NEW.user_id, NEW.debit_account_code, NEW.contact_id);
      IF v_resolved IS NOT NULL AND v_resolved <> NEW.debit_account_code THEN
        RAISE NOTICE 'Auto-redirected debit % → % (contact %)', NEW.debit_account_code, v_resolved, NEW.contact_id;
        NEW.debit_account_code := v_resolved;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If resolver fails (missing parent, etc.), keep original — don't break inserts
      NULL;
    END;
  END IF;

  -- Credit side
  IF NEW.credit_account_code = ANY(v_parents) AND NEW.contact_id IS NOT NULL THEN
    BEGIN
      v_resolved := public.resolve_postable_account(NEW.user_id, NEW.credit_account_code, NEW.contact_id);
      IF v_resolved IS NOT NULL AND v_resolved <> NEW.credit_account_code THEN
        RAISE NOTICE 'Auto-redirected credit % → % (contact %)', NEW.credit_account_code, v_resolved, NEW.contact_id;
        NEW.credit_account_code := v_resolved;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_contact_account_posting ON public.transactions;
CREATE TRIGGER trg_enforce_contact_account_posting
BEFORE INSERT OR UPDATE OF debit_account_code, credit_account_code, contact_id
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contact_account_posting();
