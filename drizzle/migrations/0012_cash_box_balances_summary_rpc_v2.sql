DROP FUNCTION IF EXISTS public.get_account_balances_summary(uuid, text[], date);
CREATE OR REPLACE FUNCTION public._norm_currency_code(_c text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(trim(coalesce(_c,'ILS')))
    WHEN 'USD' THEN 'USD' WHEN 'دولار' THEN 'USD' WHEN '$' THEN 'USD'
    WHEN 'JOD' THEN 'JOD' WHEN 'دينار' THEN 'JOD'
    WHEN 'EUR' THEN 'EUR' WHEN 'يورو' THEN 'EUR'
    WHEN 'EGP' THEN 'EGP' WHEN 'جنيه' THEN 'EGP'
    ELSE 'ILS' END
$$;
-- Server-side aggregate of the exact logic in src/lib/currency/native-amount.ts.
-- SECURITY INVOKER: the caller's RLS on transactions still applies.
CREATE OR REPLACE FUNCTION public.get_account_balances_summary(_owner uuid, _codes text[], _currencies text[], _month_start date)
RETURNS TABLE(account_code text, balance numeric, native_balance numeric, inflow numeric, outflow numeric, last_date date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH acc AS (
    SELECT DISTINCT ON (c.code) c.code AS account_code, public._norm_currency_code(c.cur) AS cur
    FROM unnest(_codes, _currencies) AS c(code, cur)
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
  )
  SELECT acc.account_code,
    coalesce(sum(l.sgn * coalesce(l.amount,0)),0),
    coalesce(sum(CASE WHEN acc.cur = 'ILS' THEN l.sgn * coalesce(l.amount,0)
                      WHEN public._norm_currency_code(l.currency) = acc.cur AND l.foreign_amount IS NOT NULL THEN l.sgn * l.foreign_amount
                      ELSE 0 END),0),
    coalesce(sum(CASE WHEN l.sgn = 1 AND l.transaction_date >= _month_start THEN l.amount ELSE 0 END),0),
    coalesce(sum(CASE WHEN l.sgn = -1 AND l.transaction_date >= _month_start THEN l.amount ELSE 0 END),0),
    max(l.transaction_date)
  FROM acc LEFT JOIN lines l ON l.code = acc.account_code
  GROUP BY acc.account_code;
$$;
GRANT EXECUTE ON FUNCTION public.get_account_balances_summary(uuid, text[], text[], date) TO authenticated;