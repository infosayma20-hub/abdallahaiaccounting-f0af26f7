-- Fix contact balance functions to filter by contact's own linked_account_code
-- Prevents balance inflation when a journal entry moves funds between two
-- different supplier/customer sub-accounts under the same contact_id
-- (e.g. account-merge entries).

CREATE OR REPLACE FUNCTION public.get_contacts_balances_bulk(
  p_user_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT NULL::text
)
RETURNS TABLE(
  contact_id uuid,
  balance numeric,
  total_debit numeric,
  total_credit numeric,
  last_transaction_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scoped AS (
    SELECT
      t.contact_id,
      t.debit_account_code,
      t.credit_account_code,
      t.amount,
      t.transaction_date,
      c.linked_account_code
    FROM public.transactions t
    JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.user_id = p_user_id
      AND t.contact_id IS NOT NULL
      AND t.is_deleted = false
      AND t.transaction_date <= p_as_of_date
      AND (p_currency IS NULL OR t.currency = p_currency)
  )
  SELECT
    s.contact_id,
    COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL AND s.linked_account_code <> ''
        THEN CASE WHEN s.debit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.debit_account_code LIKE '113%'
          OR s.debit_account_code LIKE '211%'
          OR s.debit_account_code LIKE '1146%'
        THEN s.amount ELSE 0 END
    END), 0)
    - COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL AND s.linked_account_code <> ''
        THEN CASE WHEN s.credit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.credit_account_code LIKE '113%'
          OR s.credit_account_code LIKE '211%'
          OR s.credit_account_code LIKE '1146%'
        THEN s.amount ELSE 0 END
    END), 0) AS balance,
    COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL AND s.linked_account_code <> ''
        THEN CASE WHEN s.debit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.debit_account_code LIKE '113%'
          OR s.debit_account_code LIKE '211%'
          OR s.debit_account_code LIKE '1146%'
        THEN s.amount ELSE 0 END
    END), 0) AS total_debit,
    COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL AND s.linked_account_code <> ''
        THEN CASE WHEN s.credit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.credit_account_code LIKE '113%'
          OR s.credit_account_code LIKE '211%'
          OR s.credit_account_code LIKE '1146%'
        THEN s.amount ELSE 0 END
    END), 0) AS total_credit,
    MAX(s.transaction_date) AS last_transaction_date
  FROM scoped s
  GROUP BY s.contact_id;
$function$;


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
  v_linked text;
BEGIN
  IF p_contact_id IS NULL THEN
    RETURN jsonb_build_object('balance', 0, 'currency', p_currency);
  END IF;

  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('balance', 0, 'error', 'contact not found');
  END IF;
  v_user_id := v_contact.user_id;
  v_linked := NULLIF(v_contact.linked_account_code, '');

  -- If contact has its own sub-account, restrict to movements on THAT account.
  -- Otherwise fall back to the legacy wildcard behavior (113%, 211%, 1146%).
  SELECT
    COALESCE(SUM(CASE
      WHEN v_linked IS NOT NULL
        THEN CASE WHEN debit_account_code = v_linked THEN amount ELSE 0 END
      ELSE CASE
        WHEN debit_account_code LIKE '113%'
          OR debit_account_code LIKE '211%'
          OR debit_account_code LIKE '1146%'
        THEN amount ELSE 0 END
    END), 0),
    COALESCE(SUM(CASE
      WHEN v_linked IS NOT NULL
        THEN CASE WHEN credit_account_code = v_linked THEN amount ELSE 0 END
      ELSE CASE
        WHEN credit_account_code LIKE '113%'
          OR credit_account_code LIKE '211%'
          OR credit_account_code LIKE '1146%'
        THEN amount ELSE 0 END
    END), 0)
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