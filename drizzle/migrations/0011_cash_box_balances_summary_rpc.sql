CREATE OR REPLACE FUNCTION public.get_account_balances_summary(_owner uuid, _codes text[], _month_start date)
RETURNS TABLE(account_code text, balance numeric, native_balance numeric, inflow numeric, outflow numeric, last_date date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH acc AS (
    SELECT a.account_code,
      CASE upper(trim(coalesce(a.currency,'ILS')))
        WHEN 'USD' THEN 'USD' WHEN 'دولار' THEN 'USD' WHEN '$' THEN 'USD'
        WHEN 'JOD' THEN 'JOD' WHEN 'دينار' THEN 'JOD'
        WHEN 'EUR' THEN 'EUR' WHEN 'يورو' THEN 'EUR'
        WHEN 'EGP' THEN 'EGP' WHEN 'جنيه' THEN 'EGP'
        ELSE 'ILS' END AS cur
    FROM unnest(_codes) c(code)
    LEFT JOIN LATERAL (SELECT account_code, currency FROM accounts WHERE account_code = c.code AND user_id = _owner LIMIT 1) a0 ON true
    CROSS JOIN LATERAL (SELECT c.code AS account_code, a0.currency) a
  ),
  lines AS (
    SELECT t.debit_account_code AS code, 1 AS sgn, t.amount, t.foreign_amount, t.currency, t.transaction_date
    FROM transactions t
    WHERE t.user_id = _owner AND t.debit_account_code = ANY(_codes)
      AND (t.is_deleted = false OR t.reversed_by_id IS NOT NULL)
    UNION ALL
    SELECT t.credit_account_code, -1, t.amount, t.foreign_amount, t.currency, t.transaction_date
    FROM transactions t
    WHERE t.user_id = _owner AND t.credit_account_code = ANY(_codes)
      AND (t.is_deleted = false OR t.reversed_by_id IS NOT NULL)
  ),
  norm AS (
    SELECT l.*, CASE upper(trim(coalesce(l.currency,'ILS')))
        WHEN 'USD' THEN 'USD' WHEN 'دولار' THEN 'USD' WHEN '$' THEN 'USD'
        WHEN 'JOD' THEN 'JOD' WHEN 'دينار' THEN 'JOD'
        WHEN 'EUR' THEN 'EUR' WHEN 'يورو' THEN 'EUR'
        WHEN 'EGP' THEN 'EGP' WHEN 'جنيه' THEN 'EGP'
        ELSE 'ILS' END AS txcur
    FROM lines l
  )
  SELECT acc.account_code,
    coalesce(sum(n.sgn * coalesce(n.amount,0)),0),
    coalesce(sum(CASE WHEN acc.cur = 'ILS' THEN n.sgn * coalesce(n.amount,0)
                      WHEN n.txcur = acc.cur AND n.foreign_amount IS NOT NULL THEN n.sgn * n.foreign_amount
                      ELSE 0 END),0),
    coalesce(sum(CASE WHEN n.sgn = 1 AND n.transaction_date >= _month_start THEN n.amount ELSE 0 END),0),
    coalesce(sum(CASE WHEN n.sgn = -1 AND n.transaction_date >= _month_start THEN n.amount ELSE 0 END),0),
    max(n.transaction_date)
  FROM acc LEFT JOIN norm n ON n.code = acc.account_code
  GROUP BY acc.account_code;
$$;
GRANT EXECUTE ON FUNCTION public.get_account_balances_summary(uuid, text[], date) TO authenticated;