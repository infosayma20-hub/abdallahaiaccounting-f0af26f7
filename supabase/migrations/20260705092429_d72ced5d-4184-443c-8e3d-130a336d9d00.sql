
-- STEP 1 (SAFE, ADDITIVE ONLY): Auto-fill transactions.contact_id when NULL
-- ============================================================================
-- Purpose: When a transaction is inserted/updated with a debit or credit
--   account code that belongs to a contact's linked sub-account, and the
--   contact_id is NULL, automatically populate it. This ensures new
--   transactions always appear on the contact's statement of account.
--
-- Safety guarantees:
--   * BEFORE INSERT OR UPDATE trigger — never blocks, never fails.
--   * Only sets contact_id when it IS NULL (never overwrites existing values).
--   * Only sets it when EXACTLY ONE contact matches (defensive: skips ambiguous).
--   * Scoped by user_id (tenant isolation preserved).
--   * Does not modify any existing rows. Only affects future writes.
--   * Rollback: DROP TRIGGER trg_transactions_auto_link_contact ON public.transactions;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_link_transaction_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_id uuid;
  v_match_count int;
BEGIN
  -- Only act when contact_id is missing
  IF NEW.contact_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Require a user_id for tenant scoping (safety)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if neither side has an account code
  IF NEW.debit_account_code IS NULL AND NEW.credit_account_code IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up contact whose linked_account_code matches debit or credit side,
  -- strictly scoped to same tenant. Only auto-fill if EXACTLY ONE match.
  SELECT id, COUNT(*) OVER ()
    INTO v_contact_id, v_match_count
  FROM public.contacts
  WHERE user_id = NEW.user_id
    AND linked_account_code IS NOT NULL
    AND linked_account_code IN (NEW.debit_account_code, NEW.credit_account_code)
  LIMIT 1;

  IF v_match_count = 1 AND v_contact_id IS NOT NULL THEN
    NEW.contact_id := v_contact_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach BEFORE INSERT OR UPDATE (before other triggers that may need contact_id)
DROP TRIGGER IF EXISTS trg_transactions_auto_link_contact ON public.transactions;
CREATE TRIGGER trg_transactions_auto_link_contact
  BEFORE INSERT OR UPDATE OF debit_account_code, credit_account_code, contact_id
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_transaction_contact();

COMMENT ON FUNCTION public.auto_link_transaction_contact() IS
  'Phase 1 Step 1: Auto-fills transactions.contact_id from contacts.linked_account_code when NULL and exactly one match. Additive-only. Never overwrites existing values.';
