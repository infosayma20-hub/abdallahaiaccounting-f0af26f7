-- ============================================================================
-- get_rep_customers_with_balances
-- Returns all customers assigned to a sales rep with REAL-TIME balance
-- computed from the transactions ledger (not stale contacts.current_balance).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_rep_customers_with_balances(
  p_user_id uuid,
  p_sales_rep_id uuid
)
RETURNS TABLE (
  contact_id uuid,
  contact_name text,
  phone text,
  linked_account_code text,
  balance numeric,
  last_tx_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id,
    c.contact_name,
    c.phone,
    c.linked_account_code,
    COALESCE(SUM(
      CASE
        WHEN t.debit_account_code  LIKE '113%' THEN t.amount
        WHEN t.credit_account_code LIKE '113%' THEN -t.amount
        ELSE 0
      END
    ), 0)::numeric AS balance,
    MAX(t.transaction_date)::date AS last_tx_date
  FROM public.contacts c
  LEFT JOIN public.transactions t
    ON t.contact_id  = c.id
   AND t.user_id     = c.user_id
   AND t.is_deleted  = false
  WHERE c.user_id        = p_user_id
    AND c.sales_rep_id   = p_sales_rep_id
    AND c.contact_type IN ('عميل','عميل ومورد')
    AND c.is_active   = true
    AND c.is_archived = false
  GROUP BY c.id, c.contact_name, c.phone, c.linked_account_code
  ORDER BY c.contact_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_rep_customers_with_balances(uuid, uuid) TO authenticated;

-- ============================================================================
-- get_contact_statement
-- Detailed account statement for a single contact (customer OR rep's personal
-- contact). Returns one row per ledger movement with a running balance.
-- Uses a window function so the running total is correct.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_contact_statement(
  p_user_id uuid,
  p_contact_id uuid,
  p_from_date date DEFAULT NULL,
  p_to_date date DEFAULT NULL
)
RETURNS TABLE (
  transaction_id uuid,
  transaction_date date,
  description text,
  reference text,
  debit numeric,
  credit numeric,
  balance_running numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from date := COALESCE(p_from_date, CURRENT_DATE - INTERVAL '1 year');
  v_to   date := COALESCE(p_to_date,   CURRENT_DATE);
  v_exists boolean;
BEGIN
  SELECT TRUE INTO v_exists
  FROM public.contacts
  WHERE id = p_contact_id AND user_id = p_user_id
  LIMIT 1;
  IF NOT v_exists THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH lines AS (
    SELECT
      t.id,
      t.transaction_date,
      t.description,
      t.reference,
      CASE WHEN t.debit_account_code  LIKE '113%' THEN t.amount ELSE 0 END AS debit,
      CASE WHEN t.credit_account_code LIKE '113%' THEN t.amount ELSE 0 END AS credit,
      t.created_at
    FROM public.transactions t
    WHERE t.contact_id       = p_contact_id
      AND t.user_id          = p_user_id
      AND t.is_deleted       = false
      AND t.transaction_date BETWEEN v_from AND v_to
      AND (t.debit_account_code LIKE '113%' OR t.credit_account_code LIKE '113%')
  )
  SELECT
    l.id,
    l.transaction_date,
    l.description,
    l.reference,
    NULLIF(l.debit,  0)::numeric  AS debit,
    NULLIF(l.credit, 0)::numeric  AS credit,
    SUM(l.debit - l.credit)
      OVER (ORDER BY l.transaction_date, l.created_at
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric
      AS balance_running
  FROM lines l
  ORDER BY l.transaction_date, l.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_statement(uuid, uuid, date, date) TO authenticated;