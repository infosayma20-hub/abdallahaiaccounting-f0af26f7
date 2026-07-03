
-- ============================================================================
-- Step 1: Ensure every POS tenant has the anonymous cash-customers sub-account
-- ============================================================================
DO $$
DECLARE
  r record;
  v_exists boolean;
BEGIN
  FOR r IN
    SELECT DISTINCT t.user_id
    FROM transactions t
    WHERE t.transaction_type IN ('pos_sale','pos_refund','reversal')
      AND t.is_deleted = false
      AND (t.description LIKE '%POS-%' OR t.description LIKE '%نقطة البيع%')
  LOOP
    -- Skip if parent 1130 doesn't exist for this tenant
    SELECT EXISTS(SELECT 1 FROM accounts WHERE user_id=r.user_id AND account_code='1130') INTO v_exists;
    IF NOT v_exists THEN CONTINUE; END IF;

    -- Create sub-account if missing
    INSERT INTO accounts(user_id, account_code, account_name, account_type, parent_code,
                         is_active, is_system, nature, currency, notes)
    SELECT r.user_id, '11300000', 'عملاء نقاط البيع النقديون', 'asset', '1130',
           true, false, 'debit', 'شيكل',
           'حساب فرعي تلقائي لمبيعات POS بدون عميل محدد'
    WHERE NOT EXISTS (
      SELECT 1 FROM accounts WHERE user_id=r.user_id AND account_code='11300000'
    );
  END LOOP;
END $$;

-- ============================================================================
-- Step 2: Trigger — redirect anonymous POS postings to the cash-customer account
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_pos_anonymous_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target CONSTANT text := '11300000';
  v_has_target boolean;
  v_is_pos boolean;
BEGIN
  -- Only touch POS-related rows with no contact_id
  v_is_pos := NEW.contact_id IS NULL
              AND (
                NEW.transaction_type IN ('pos_sale','pos_refund')
                OR (NEW.transaction_type = 'reversal' AND NEW.description LIKE '%POS%')
                OR NEW.description LIKE '%نقطة البيع%'
              );

  IF NOT v_is_pos THEN RETURN NEW; END IF;

  -- Verify target sub-account exists for this tenant
  SELECT EXISTS(
    SELECT 1 FROM accounts
    WHERE user_id = NEW.user_id AND account_code = v_target AND is_active = true
  ) INTO v_has_target;

  IF NOT v_has_target THEN RETURN NEW; END IF;

  -- Redirect parent-root postings
  IF NEW.debit_account_code IN ('1130','2180') THEN
    NEW.debit_account_code := v_target;
  END IF;
  IF NEW.credit_account_code IN ('1130','2180') THEN
    NEW.credit_account_code := v_target;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pos_anonymous_posting ON public.transactions;
CREATE TRIGGER trg_enforce_pos_anonymous_posting
BEFORE INSERT OR UPDATE OF debit_account_code, credit_account_code, transaction_type, contact_id
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pos_anonymous_posting();
