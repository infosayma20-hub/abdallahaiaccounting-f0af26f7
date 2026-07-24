
-- Read-only reconciliation function: compares contact stored balance
-- against the actual ledger movement on its linked account.
-- No data changes. No UPDATE. Safe by design.
CREATE OR REPLACE FUNCTION public.get_contact_balance_reconciliation(p_user_id uuid)
RETURNS TABLE (
  contact_id uuid,
  contact_name text,
  contact_type text,
  linked_account_code text,
  is_archived boolean,
  is_active boolean,
  stored_balance numeric,
  ledger_debits numeric,
  ledger_credits numeric,
  ledger_balance numeric,
  variance numeric,
  tx_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ledger AS (
    SELECT
      c.id,
      c.contact_name,
      c.contact_type,
      c.linked_account_code,
      COALESCE(c.is_archived, false) AS is_archived,
      COALESCE(c.is_active, true)    AS is_active,
      COALESCE(c.current_balance, 0) AS stored,
      COALESCE(SUM(CASE WHEN t.debit_account_code  = c.linked_account_code THEN t.amount ELSE 0 END), 0) AS debits,
      COALESCE(SUM(CASE WHEN t.credit_account_code = c.linked_account_code THEN t.amount ELSE 0 END), 0) AS credits,
      COUNT(t.id) AS n
    FROM public.contacts c
    LEFT JOIN public.transactions t
      ON t.user_id = c.user_id
     AND t.is_deleted = false
     AND (t.debit_account_code = c.linked_account_code
          OR t.credit_account_code = c.linked_account_code)
    WHERE c.user_id = p_user_id
    GROUP BY c.id, c.contact_name, c.contact_type, c.linked_account_code,
             c.is_archived, c.is_active, c.current_balance
  )
  SELECT
    id,
    contact_name,
    contact_type,
    linked_account_code,
    is_archived,
    is_active,
    stored,
    debits,
    credits,
    CASE WHEN contact_type IN ('مورد','موظف','supplier','employee')
         THEN credits - debits
         ELSE debits - credits END AS ledger_balance,
    (CASE WHEN contact_type IN ('مورد','موظف','supplier','employee')
          THEN credits - debits
          ELSE debits - credits END) - stored AS variance,
    n
  FROM ledger;
$$;

REVOKE ALL ON FUNCTION public.get_contact_balance_reconciliation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_contact_balance_reconciliation(uuid) TO authenticated;
