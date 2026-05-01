-- Phase 5G.1: Contact Balance Account Coverage Fix
-- Problem: get_contact_balance only matched LIKE '113%' OR '211%', which excluded
-- supplier prepayment account 1146 (Advances to Suppliers, asset). Customer
-- prepayments 2115 are already covered because they fall under the '211%' prefix.
-- This fix extends the matcher to include '1146%' so the function reflects the
-- true commercial balance per AccountStatementV2's canonical formula:
--   Customer: 1130 + 2115
--   Supplier: 2110 + 1146
-- Sign convention is unchanged (debit - credit). For a customer with a 2115
-- credit (prepayment received) the balance becomes negative ("we owe them"),
-- and for a supplier with a 1146 debit (prepayment paid) the balance becomes
-- positive ("they owe us") — consistent with ledger semantics.

CREATE OR REPLACE FUNCTION public.get_contact_balance(
  p_contact_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric := 0;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_user_id uuid;
  v_contact RECORD;
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN jsonb_build_object('balance', 0, 'currency', p_currency);
  END IF;

  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('balance', 0, 'error', 'contact not found');
  END IF;
  v_user_id := v_contact.user_id;

  -- Sum debits/credits where the contact is the customer or supplier across
  -- the full commercial perimeter:
  --   113%  -> AR (1130) and any sub-accounts (113001 ...)
  --   211%  -> AP (2110) and customer prepayments (2115)
  --   1146% -> supplier prepayments (Advances to Suppliers, asset)
  SELECT
    COALESCE(SUM(CASE
      WHEN debit_account_code LIKE '113%'
        OR debit_account_code LIKE '211%'
        OR debit_account_code LIKE '1146%'
      THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN credit_account_code LIKE '113%'
        OR credit_account_code LIKE '211%'
        OR credit_account_code LIKE '1146%'
      THEN amount ELSE 0 END), 0)
  INTO v_total_debit, v_total_credit
  FROM public.transactions
  WHERE user_id = v_user_id
    AND contact_id = p_contact_id
    AND transaction_date <= p_as_of_date
    AND is_deleted = false
    AND (p_currency IS NULL OR currency = p_currency);

  v_balance := v_total_debit - v_total_credit;

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'balance', v_balance,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'currency', COALESCE(p_currency, 'شيكل'),
    'as_of_date', p_as_of_date
  );
END;
$function$;