CREATE OR REPLACE FUNCTION public.get_portal_overview_kpis(p_user_id uuid, p_from date, p_to date)
 RETURNS TABLE(revenue numeric, purchases numeric, gen_exp numeric, receivables numeric, payables numeric, cash_dr numeric, cash_cr numeric, inflows numeric, outflows numeric, chart_json jsonb, top_debtors_json jsonb, top_creditors_json jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chart jsonb;
  v_debtors jsonb;
  v_creditors jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'date'), '[]'::jsonb) INTO v_chart
  FROM (
    SELECT jsonb_build_object(
      'date', transaction_date,
      'revenue', SUM(CASE WHEN credit_account_code LIKE '4%' THEN amount ELSE 0 END),
      'expenses', SUM(CASE WHEN debit_account_code LIKE '5%' OR debit_account_code LIKE '6%' THEN amount ELSE 0 END)
    ) AS row
    FROM public.transactions
    WHERE user_id = p_user_id
      AND is_deleted = false
      AND reversed_by_id IS NULL
      AND transaction_type IS DISTINCT FROM 'reversal'
      AND COALESCE(is_opening_balance, false) = false
      AND transaction_type IS DISTINCT FROM 'رصيد ابتدائي'
      AND transaction_date BETWEEN p_from AND p_to
    GROUP BY transaction_date
  ) s;

  -- Top debtors (customers with positive AR balance, incl. 1130xxxx sub-accounts)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', contact_name, 'balance', bal) ORDER BY bal DESC), '[]'::jsonb)
  INTO v_debtors
  FROM (
    SELECT c.contact_name,
      SUM(CASE WHEN t.debit_account_code  LIKE '1130%' THEN t.amount ELSE 0 END)
    - SUM(CASE WHEN t.credit_account_code LIKE '1130%' THEN t.amount ELSE 0 END) AS bal
    FROM public.transactions t
    JOIN public.contacts c ON c.id = t.contact_id AND c.user_id = t.user_id
    WHERE t.user_id = p_user_id
      AND t.is_deleted = false
      AND t.reversed_by_id IS NULL
      AND (t.debit_account_code LIKE '1130%' OR t.credit_account_code LIKE '1130%')
    GROUP BY c.contact_name
    HAVING SUM(CASE WHEN t.debit_account_code LIKE '1130%' THEN t.amount ELSE 0 END)
         - SUM(CASE WHEN t.credit_account_code LIKE '1130%' THEN t.amount ELSE 0 END) > 0.01
    ORDER BY bal DESC
    LIMIT 5
  ) d;

  -- Top creditors (suppliers with positive AP balance, incl. 2110xxxx sub-accounts)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', contact_name, 'balance', bal) ORDER BY bal DESC), '[]'::jsonb)
  INTO v_creditors
  FROM (
    SELECT c.contact_name,
      SUM(CASE WHEN t.credit_account_code LIKE '2110%' THEN t.amount ELSE 0 END)
    - SUM(CASE WHEN t.debit_account_code  LIKE '2110%' THEN t.amount ELSE 0 END) AS bal
    FROM public.transactions t
    JOIN public.contacts c ON c.id = t.contact_id AND c.user_id = t.user_id
    WHERE t.user_id = p_user_id
      AND t.is_deleted = false
      AND t.reversed_by_id IS NULL
      AND (t.credit_account_code LIKE '2110%' OR t.debit_account_code LIKE '2110%')
    GROUP BY c.contact_name
    HAVING SUM(CASE WHEN t.credit_account_code LIKE '2110%' THEN t.amount ELSE 0 END)
         - SUM(CASE WHEN t.debit_account_code LIKE '2110%' THEN t.amount ELSE 0 END) > 0.01
    ORDER BY bal DESC
    LIMIT 5
  ) cr;

  RETURN QUERY
  WITH period AS (
    SELECT amount, debit_account_code AS dc, credit_account_code AS cc
    FROM public.transactions
    WHERE user_id = p_user_id
      AND is_deleted = false
      AND reversed_by_id IS NULL
      AND transaction_type IS DISTINCT FROM 'reversal'
      AND COALESCE(is_opening_balance, false) = false
      AND transaction_type IS DISTINCT FROM 'رصيد ابتدائي'
      AND transaction_date BETWEEN p_from AND p_to
  ),
  cumulative AS (
    SELECT amount, debit_account_code AS dc, credit_account_code AS cc
    FROM public.transactions
    WHERE user_id = p_user_id
      AND is_deleted = false
      AND reversed_by_id IS NULL
      AND transaction_type IS DISTINCT FROM 'reversal'
  )
  SELECT
    (SELECT COALESCE(SUM(amount), 0) FROM period WHERE cc LIKE '4%')::numeric,
    (SELECT COALESCE(SUM(amount), 0) FROM period WHERE dc LIKE '51%' OR dc LIKE '52%')::numeric,
    (SELECT COALESCE(SUM(amount), 0) FROM period
       WHERE (dc LIKE '5%' AND dc NOT LIKE '51%' AND dc NOT LIKE '52%') OR dc LIKE '6%')::numeric,
    GREATEST(0,
      (SELECT COALESCE(SUM(amount),0) FROM cumulative WHERE dc LIKE '1130%')
    - (SELECT COALESCE(SUM(amount),0) FROM cumulative WHERE cc LIKE '1130%')
    )::numeric,
    GREATEST(0,
      (SELECT COALESCE(SUM(amount),0) FROM cumulative WHERE cc LIKE '2110%')
    - (SELECT COALESCE(SUM(amount),0) FROM cumulative WHERE dc LIKE '2110%')
    )::numeric,
    (SELECT COALESCE(SUM(amount),0) FROM cumulative WHERE dc LIKE '111%' OR dc LIKE '112%')::numeric,
    (SELECT COALESCE(SUM(amount),0) FROM cumulative WHERE cc LIKE '111%' OR cc LIKE '112%')::numeric,
    (SELECT COALESCE(SUM(amount),0) FROM period WHERE dc LIKE '111%' OR dc LIKE '112%')::numeric,
    (SELECT COALESCE(SUM(amount),0) FROM period WHERE cc LIKE '111%' OR cc LIKE '112%')::numeric,
    v_chart,
    v_debtors,
    v_creditors;
END;
$function$;