-- Bulk contact balances: replaces per-contact fanout on ContactsPage.
-- Aggregates AR/AP/prepayment balances + last_transaction_date for a whole tenant in one query.
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
SET search_path TO 'public'
AS $$
  SELECT
    t.contact_id,
    COALESCE(SUM(CASE
      WHEN t.debit_account_code LIKE '113%'
        OR t.debit_account_code LIKE '211%'
        OR t.debit_account_code LIKE '1146%'
      THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE
      WHEN t.credit_account_code LIKE '113%'
        OR t.credit_account_code LIKE '211%'
        OR t.credit_account_code LIKE '1146%'
      THEN t.amount ELSE 0 END), 0) AS balance,
    COALESCE(SUM(CASE
      WHEN t.debit_account_code LIKE '113%'
        OR t.debit_account_code LIKE '211%'
        OR t.debit_account_code LIKE '1146%'
      THEN t.amount ELSE 0 END), 0) AS total_debit,
    COALESCE(SUM(CASE
      WHEN t.credit_account_code LIKE '113%'
        OR t.credit_account_code LIKE '211%'
        OR t.credit_account_code LIKE '1146%'
      THEN t.amount ELSE 0 END), 0) AS total_credit,
    MAX(t.transaction_date) AS last_transaction_date
  FROM public.transactions t
  WHERE t.user_id = p_user_id
    AND t.contact_id IS NOT NULL
    AND t.is_deleted = false
    AND t.transaction_date <= p_as_of_date
    AND (p_currency IS NULL OR t.currency = p_currency)
  GROUP BY t.contact_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_contacts_balances_bulk(uuid, date, text) TO authenticated, service_role;

-- Supporting index for the aggregate scan (covers WHERE user_id + is_deleted + contact_id).
CREATE INDEX IF NOT EXISTS idx_transactions_user_contact_active
  ON public.transactions (user_id, contact_id, transaction_date)
  WHERE is_deleted = false;