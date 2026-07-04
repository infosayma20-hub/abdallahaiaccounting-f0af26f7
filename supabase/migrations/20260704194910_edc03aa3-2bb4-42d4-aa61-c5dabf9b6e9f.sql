
CREATE OR REPLACE FUNCTION public.get_sub_account_balances(p_owner uuid, p_parents text[])
RETURNS TABLE(account_code text, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.account_code,
         COALESCE(SUM(CASE WHEN t.debit_account_code = a.account_code THEN t.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN t.credit_account_code = a.account_code THEN t.amount ELSE 0 END), 0) AS balance
  FROM public.accounts a
  LEFT JOIN public.transactions t
    ON t.user_id = a.user_id
   AND t.is_deleted = false
   AND (t.debit_account_code = a.account_code OR t.credit_account_code = a.account_code)
  WHERE a.user_id = p_owner
    AND a.parent_code = ANY(p_parents)
  GROUP BY a.account_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_sub_account_balances(uuid, text[]) TO authenticated, service_role;
