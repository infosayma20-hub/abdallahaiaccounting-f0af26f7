
CREATE OR REPLACE FUNCTION public.get_all_cash_box_balances(p_owner uuid)
RETURNS TABLE(account_code text, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH boxes AS (
    SELECT DISTINCT gl_account_code
    FROM public.cash_boxes
    WHERE user_id = p_owner
      AND gl_account_code IS NOT NULL
  )
  SELECT b.gl_account_code AS account_code,
         COALESCE(SUM(CASE WHEN t.debit_account_code  = b.gl_account_code THEN t.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN t.credit_account_code = b.gl_account_code THEN t.amount ELSE 0 END), 0) AS balance
  FROM boxes b
  LEFT JOIN public.transactions t
    ON t.user_id = p_owner
   AND t.is_deleted = false
   AND (t.debit_account_code = b.gl_account_code OR t.credit_account_code = b.gl_account_code)
  GROUP BY b.gl_account_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_cash_box_balances(uuid) TO authenticated, service_role;
