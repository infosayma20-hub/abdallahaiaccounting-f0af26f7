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
  WITH contact_scope AS (
    SELECT
      c.id AS contact_id,
      c.user_id,
      NULLIF(c.linked_account_code, '') AS linked_account_code
    FROM public.contacts c
    WHERE c.user_id = p_user_id
  ), scoped AS (
    SELECT
      c.contact_id,
      c.linked_account_code,
      t.debit_account_code,
      t.credit_account_code,
      t.amount,
      t.transaction_date
    FROM contact_scope c
    JOIN public.transactions t
      ON t.user_id = c.user_id
     AND t.is_deleted = false
     AND t.transaction_date <= p_as_of_date
     AND (p_currency IS NULL OR t.currency = p_currency)
     AND (
       (
         c.linked_account_code IS NOT NULL
         AND (
           t.debit_account_code = c.linked_account_code
           OR t.credit_account_code = c.linked_account_code
         )
       )
       OR (
         c.linked_account_code IS NULL
         AND t.contact_id = c.contact_id
       )
     )
  )
  SELECT
    s.contact_id,
    COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL
        THEN CASE WHEN s.debit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.debit_account_code LIKE '113%'
          OR s.debit_account_code LIKE '211%'
          OR s.debit_account_code LIKE '1146%'
          OR s.debit_account_code LIKE '2180%'
        THEN s.amount ELSE 0 END
    END), 0)
    - COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL
        THEN CASE WHEN s.credit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.credit_account_code LIKE '113%'
          OR s.credit_account_code LIKE '211%'
          OR s.credit_account_code LIKE '1146%'
          OR s.credit_account_code LIKE '2180%'
        THEN s.amount ELSE 0 END
    END), 0) AS balance,
    COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL
        THEN CASE WHEN s.debit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.debit_account_code LIKE '113%'
          OR s.debit_account_code LIKE '211%'
          OR s.debit_account_code LIKE '1146%'
          OR s.debit_account_code LIKE '2180%'
        THEN s.amount ELSE 0 END
    END), 0) AS total_debit,
    COALESCE(SUM(CASE
      WHEN s.linked_account_code IS NOT NULL
        THEN CASE WHEN s.credit_account_code = s.linked_account_code THEN s.amount ELSE 0 END
      ELSE CASE
        WHEN s.credit_account_code LIKE '113%'
          OR s.credit_account_code LIKE '211%'
          OR s.credit_account_code LIKE '1146%'
          OR s.credit_account_code LIKE '2180%'
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

  -- If the contact has a dedicated sub-account, that account code is the
  -- authoritative ledger identity. Include every movement touching that account,
  -- even when the row's contact_id belongs to the counterparty (account-merge
  -- journal entries such as potato -> Abu Raad). If there is no linked account,
  -- keep the legacy contact_id fallback.
  SELECT
    COALESCE(SUM(CASE
      WHEN v_linked IS NOT NULL
        THEN CASE WHEN debit_account_code = v_linked THEN amount ELSE 0 END
      ELSE CASE
        WHEN debit_account_code LIKE '113%'
          OR debit_account_code LIKE '211%'
          OR debit_account_code LIKE '1146%'
          OR debit_account_code LIKE '2180%'
        THEN amount ELSE 0 END
    END), 0),
    COALESCE(SUM(CASE
      WHEN v_linked IS NOT NULL
        THEN CASE WHEN credit_account_code = v_linked THEN amount ELSE 0 END
      ELSE CASE
        WHEN credit_account_code LIKE '113%'
          OR credit_account_code LIKE '211%'
          OR credit_account_code LIKE '1146%'
          OR credit_account_code LIKE '2180%'
        THEN amount ELSE 0 END
    END), 0)
  INTO v_total_debit, v_total_credit
  FROM public.transactions
  WHERE user_id = v_user_id
    AND transaction_date <= p_as_of_date
    AND is_deleted = false
    AND (p_currency IS NULL OR currency = p_currency)
    AND (
      (
        v_linked IS NOT NULL
        AND (debit_account_code = v_linked OR credit_account_code = v_linked)
      )
      OR (
        v_linked IS NULL
        AND contact_id = p_contact_id
      )
    );

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