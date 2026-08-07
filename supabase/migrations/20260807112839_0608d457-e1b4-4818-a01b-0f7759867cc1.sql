CREATE OR REPLACE FUNCTION public.get_accounting_center_kpi_breakdown(_prefix text, _natural text DEFAULT 'debit'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_accounts jsonb;
  v_recent jsonb;
  v_total numeric := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  WITH lines AS (
    SELECT debit_account_code AS code, amount AS dr, 0::numeric AS cr
    FROM transactions
    WHERE user_id = v_user AND is_deleted = false AND debit_account_code LIKE _prefix
    UNION ALL
    SELECT credit_account_code AS code, 0::numeric AS dr, amount AS cr
    FROM transactions
    WHERE user_id = v_user AND is_deleted = false AND credit_account_code LIKE _prefix
  ), agg AS (
    SELECT l.code,
           SUM(l.dr) AS total_debit,
           SUM(l.cr) AS total_credit,
           CASE WHEN _natural = 'credit' THEN SUM(l.cr) - SUM(l.dr) ELSE SUM(l.dr) - SUM(l.cr) END AS balance,
           COUNT(*) AS entries
    FROM lines l
    GROUP BY l.code
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY abs(x.balance) DESC), '[]'::jsonb),
         COALESCE(SUM(x.balance), 0)
  INTO v_accounts, v_total
  FROM (
    SELECT a.code, COALESCE(acc.account_name, a.code) AS name, a.total_debit, a.total_credit, a.balance, a.entries
    FROM agg a
    LEFT JOIN accounts acc ON acc.account_code = a.code AND acc.user_id = v_user
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(y)), '[]'::jsonb) INTO v_recent FROM (
    SELECT t.id, t.transaction_date, t.transaction_type, t.debit_account_code, t.credit_account_code,
           t.amount, t.reference, t.description,
           CASE WHEN t.debit_account_code LIKE _prefix THEN 'debit' ELSE 'credit' END AS side
    FROM transactions t
    WHERE t.user_id = v_user AND t.is_deleted = false
      AND (t.debit_account_code LIKE _prefix OR t.credit_account_code LIKE _prefix)
    ORDER BY t.transaction_date DESC, t.created_at DESC
    LIMIT 50
  ) y;

  RETURN jsonb_build_object('prefix', _prefix, 'total', v_total, 'accounts', v_accounts, 'recent', v_recent);
END $function$;