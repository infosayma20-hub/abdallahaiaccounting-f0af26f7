
CREATE OR REPLACE FUNCTION public.get_contacts_balances_bulk(
  p_user_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT NULL
)
RETURNS TABLE (
  contact_id uuid,
  balance numeric,
  total_debit numeric,
  total_credit numeric,
  last_transaction_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tx AS (
    SELECT
      t.debit_account_code,
      t.credit_account_code,
      t.contact_id,
      t.amount,
      t.transaction_date
    FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.is_deleted = false
      AND t.transaction_date <= p_as_of_date
      AND (p_currency IS NULL OR t.currency = p_currency)
  ),
  -- Aggregate per account_code ONCE (both sides of the entry)
  by_account AS (
    SELECT
      account_code,
      SUM(debit)  AS debit,
      SUM(credit) AS credit,
      MAX(transaction_date) AS last_date
    FROM (
      SELECT debit_account_code  AS account_code, amount AS debit, 0::numeric AS credit, transaction_date
        FROM tx WHERE debit_account_code IS NOT NULL
      UNION ALL
      SELECT credit_account_code AS account_code, 0::numeric AS debit, amount AS credit, transaction_date
        FROM tx WHERE credit_account_code IS NOT NULL
    ) u
    GROUP BY account_code
  ),
  -- Fallback aggregation by contact_id for contacts without linked_account_code
  by_contact AS (
    SELECT
      contact_id,
      SUM(CASE WHEN debit_account_code LIKE '113%'
             OR debit_account_code LIKE '211%'
             OR debit_account_code LIKE '1146%'
             OR debit_account_code LIKE '2180%' THEN amount ELSE 0 END) AS debit,
      SUM(CASE WHEN credit_account_code LIKE '113%'
             OR credit_account_code LIKE '211%'
             OR credit_account_code LIKE '1146%'
             OR credit_account_code LIKE '2180%' THEN amount ELSE 0 END) AS credit,
      MAX(transaction_date) AS last_date
    FROM tx
    WHERE contact_id IS NOT NULL
    GROUP BY contact_id
  )
  SELECT
    c.id AS contact_id,
    (COALESCE(CASE WHEN NULLIF(c.linked_account_code,'') IS NOT NULL THEN a.debit  ELSE bc.debit  END, 0)
   - COALESCE(CASE WHEN NULLIF(c.linked_account_code,'') IS NOT NULL THEN a.credit ELSE bc.credit END, 0))::numeric AS balance,
    COALESCE(CASE WHEN NULLIF(c.linked_account_code,'') IS NOT NULL THEN a.debit  ELSE bc.debit  END, 0)::numeric AS total_debit,
    COALESCE(CASE WHEN NULLIF(c.linked_account_code,'') IS NOT NULL THEN a.credit ELSE bc.credit END, 0)::numeric AS total_credit,
    CASE WHEN NULLIF(c.linked_account_code,'') IS NOT NULL THEN a.last_date ELSE bc.last_date END AS last_transaction_date
  FROM public.contacts c
  LEFT JOIN by_account a  ON a.account_code = NULLIF(c.linked_account_code, '')
  LEFT JOIN by_contact bc ON bc.contact_id  = c.id
  WHERE c.user_id = p_user_id;
$$;

-- Ensure execute grant is intact
GRANT EXECUTE ON FUNCTION public.get_contacts_balances_bulk(uuid, date, text) TO authenticated;

-- Supporting indexes for the aggregation (idempotent)
CREATE INDEX IF NOT EXISTS idx_transactions_user_notdel_date
  ON public.transactions (user_id, transaction_date)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_transactions_user_debit_code
  ON public.transactions (user_id, debit_account_code)
  WHERE is_deleted = false AND debit_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_credit_code
  ON public.transactions (user_id, credit_account_code)
  WHERE is_deleted = false AND credit_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_contact
  ON public.transactions (user_id, contact_id)
  WHERE is_deleted = false AND contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_user_linked_code
  ON public.contacts (user_id, linked_account_code);
