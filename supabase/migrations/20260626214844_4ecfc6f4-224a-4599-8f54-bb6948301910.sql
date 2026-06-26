
-- إصلاح: استخدام debit/credit بدل debit_amount/credit_amount

CREATE OR REPLACE FUNCTION public.sparta_close_fiscal_year(p_fy_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hold uuid := public.sparta_holding_id();
  v_fy record;
  v_revenue numeric(18,2) := 0;
  v_expense numeric(18,2) := 0;
  v_net numeric(18,2);
  v_je_id uuid;
  v_entry_no text;
  r record;
  v_re_account uuid;
BEGIN
  IF v_hold IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO v_fy FROM public.sparta_fiscal_years WHERE id = p_fy_id AND holding_id = v_hold;
  IF v_fy IS NULL THEN RAISE EXCEPTION 'السنة المالية غير موجودة'; END IF;
  IF v_fy.status = 'closed' THEN RAISE EXCEPTION 'السنة مقفلة مسبقاً'; END IF;

  v_re_account := v_fy.retained_earnings_account_id;
  IF v_re_account IS NULL THEN
    SELECT id INTO v_re_account FROM public.sparta_accounts
      WHERE holding_id = v_hold AND code = '3200' LIMIT 1;
    IF v_re_account IS NULL THEN RAISE EXCEPTION 'حساب الأرباح المحتجزة (3200) غير موجود'; END IF;
  END IF;

  v_entry_no := public.sparta_next_entry_no();
  INSERT INTO public.sparta_journal_entries (
    holding_id, entry_no, entry_date, description, source_type, status, created_by
  ) VALUES (
    v_hold, v_entry_no, v_fy.end_date,
    'قيد إقفال السنة المالية ' || v_fy.year_number,
    'year_close', 'posted', auth.uid()
  ) RETURNING id INTO v_je_id;

  FOR r IN
    SELECT a.id, a.code,
      COALESCE(SUM(jl.credit - jl.debit),0) AS bal
    FROM public.sparta_accounts a
    LEFT JOIN public.sparta_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.sparta_journal_entries je ON je.id = jl.entry_id
      AND je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date
      AND je.status = 'posted'
    WHERE a.holding_id = v_hold AND a.code LIKE '4%' AND a.is_postable = true
    GROUP BY a.id, a.code
    HAVING COALESCE(SUM(jl.credit - jl.debit),0) <> 0
  LOOP
    INSERT INTO public.sparta_journal_lines (holding_id, entry_id, account_id, debit, credit, description)
    VALUES (v_hold, v_je_id, r.id, r.bal, 0, 'إقفال إيراد');
    v_revenue := v_revenue + r.bal;
  END LOOP;

  FOR r IN
    SELECT a.id, a.code,
      COALESCE(SUM(jl.debit - jl.credit),0) AS bal
    FROM public.sparta_accounts a
    LEFT JOIN public.sparta_journal_lines jl ON jl.account_id = a.id
    LEFT JOIN public.sparta_journal_entries je ON je.id = jl.entry_id
      AND je.entry_date BETWEEN v_fy.start_date AND v_fy.end_date
      AND je.status = 'posted'
    WHERE a.holding_id = v_hold AND a.code LIKE '5%' AND a.is_postable = true
    GROUP BY a.id, a.code
    HAVING COALESCE(SUM(jl.debit - jl.credit),0) <> 0
  LOOP
    INSERT INTO public.sparta_journal_lines (holding_id, entry_id, account_id, debit, credit, description)
    VALUES (v_hold, v_je_id, r.id, 0, r.bal, 'إقفال مصروف');
    v_expense := v_expense + r.bal;
  END LOOP;

  v_net := v_revenue - v_expense;

  IF v_net > 0 THEN
    INSERT INTO public.sparta_journal_lines (holding_id, entry_id, account_id, debit, credit, description)
    VALUES (v_hold, v_je_id, v_re_account, 0, v_net, 'صافي الربح للسنة');
  ELSIF v_net < 0 THEN
    INSERT INTO public.sparta_journal_lines (holding_id, entry_id, account_id, debit, credit, description)
    VALUES (v_hold, v_je_id, v_re_account, -v_net, 0, 'صافي الخسارة للسنة');
  END IF;

  UPDATE public.sparta_fiscal_years
  SET status = 'closed', closed_at = now(), closed_by = auth.uid(), net_income = v_net
  WHERE id = p_fy_id;

  UPDATE public.sparta_fiscal_periods
  SET status = 'closed', locked_at = COALESCE(locked_at, now()), locked_by = COALESCE(locked_by, auth.uid())
  WHERE fiscal_year_id = p_fy_id;

  INSERT INTO public.sparta_closing_entries (
    holding_id, fiscal_year_id, journal_entry_id, closing_type,
    total_revenue, total_expense, net_income, created_by
  ) VALUES (
    v_hold, p_fy_id, v_je_id, 'year_end', v_revenue, v_expense, v_net, auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true, 'journal_entry_id', v_je_id,
    'revenue', v_revenue, 'expense', v_expense, 'net_income', v_net
  );
END $$;

CREATE OR REPLACE FUNCTION public.sparta_cash_flow_statement(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hold uuid := public.sparta_holding_id();
  v_operating numeric := 0;
  v_investing numeric := 0;
  v_financing numeric := 0;
  v_opening_cash numeric := 0;
  v_closing_cash numeric := 0;
  v_net_change numeric := 0;
BEGIN
  IF v_hold IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_opening_cash
  FROM public.sparta_journal_lines jl
  JOIN public.sparta_journal_entries je ON je.id = jl.entry_id
  JOIN public.sparta_accounts a ON a.id = jl.account_id
  WHERE a.holding_id = v_hold AND (a.code LIKE '111%' OR a.code LIKE '112%')
    AND je.status = 'posted' AND je.entry_date < p_from;

  SELECT COALESCE(SUM(CASE
    WHEN a2.code LIKE '4%' THEN jl.credit - jl.debit
    WHEN a2.code LIKE '5%' THEN -(jl.debit - jl.credit)
    WHEN a2.code LIKE '113%' OR a2.code LIKE '114%' THEN -(jl.debit - jl.credit)
    WHEN a2.code LIKE '21%' THEN jl.credit - jl.debit
    ELSE 0 END), 0) INTO v_operating
  FROM public.sparta_journal_entries je
  JOIN public.sparta_journal_lines jl ON jl.entry_id = je.id
  JOIN public.sparta_accounts a2 ON a2.id = jl.account_id
  WHERE a2.holding_id = v_hold AND je.status = 'posted'
    AND je.entry_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_investing
  FROM public.sparta_journal_lines jl
  JOIN public.sparta_journal_entries je ON je.id = jl.entry_id
  JOIN public.sparta_accounts a ON a.id = jl.account_id
  WHERE a.holding_id = v_hold AND a.code LIKE '12%'
    AND je.status = 'posted' AND je.entry_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_financing
  FROM public.sparta_journal_lines jl
  JOIN public.sparta_journal_entries je ON je.id = jl.entry_id
  JOIN public.sparta_accounts a ON a.id = jl.account_id
  WHERE a.holding_id = v_hold AND (a.code LIKE '3%' OR a.code LIKE '22%')
    AND je.status = 'posted' AND je.entry_date BETWEEN p_from AND p_to;

  v_net_change := v_operating + v_investing + v_financing;
  v_closing_cash := v_opening_cash + v_net_change;

  RETURN jsonb_build_object(
    'period_from', p_from, 'period_to', p_to,
    'opening_cash', v_opening_cash,
    'operating_activities', v_operating,
    'investing_activities', v_investing,
    'financing_activities', v_financing,
    'net_change', v_net_change,
    'closing_cash', v_closing_cash
  );
END $$;

CREATE OR REPLACE FUNCTION public.sparta_budget_vs_actual(p_fy_id uuid, p_period int DEFAULT NULL)
RETURNS TABLE (
  account_id uuid, account_code text, account_name text,
  budget_amount numeric, actual_amount numeric, variance numeric, variance_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hold uuid := public.sparta_holding_id();
  v_start date;
  v_end date;
  v_fy record;
BEGIN
  IF v_hold IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO v_fy FROM public.sparta_fiscal_years WHERE id = p_fy_id AND holding_id = v_hold;
  IF v_fy IS NULL THEN RAISE EXCEPTION 'السنة غير موجودة'; END IF;

  IF p_period IS NULL THEN
    v_start := v_fy.start_date; v_end := v_fy.end_date;
  ELSE
    v_start := make_date(v_fy.year_number, p_period, 1);
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
  END IF;

  RETURN QUERY
  WITH bud AS (
    SELECT b.account_id, SUM(b.budget_amount) AS budget
    FROM public.sparta_budgets b
    WHERE b.fiscal_year_id = p_fy_id
      AND (p_period IS NULL OR b.period_number = p_period)
    GROUP BY b.account_id
  ),
  act AS (
    SELECT jl.account_id,
      SUM(CASE WHEN a.code LIKE '4%' THEN jl.credit - jl.debit
               WHEN a.code LIKE '5%' THEN jl.debit - jl.credit
               ELSE jl.debit - jl.credit END) AS actual
    FROM public.sparta_journal_lines jl
    JOIN public.sparta_journal_entries je ON je.id = jl.entry_id
    JOIN public.sparta_accounts a ON a.id = jl.account_id
    WHERE a.holding_id = v_hold AND je.status = 'posted'
      AND je.entry_date BETWEEN v_start AND v_end
    GROUP BY jl.account_id
  )
  SELECT a.id, a.code, a.name_ar,
    COALESCE(bud.budget, 0),
    COALESCE(act.actual, 0),
    COALESCE(act.actual, 0) - COALESCE(bud.budget, 0),
    CASE WHEN COALESCE(bud.budget,0) = 0 THEN NULL
         ELSE ROUND(((COALESCE(act.actual,0) - bud.budget) / bud.budget * 100)::numeric, 2)
    END
  FROM public.sparta_accounts a
  LEFT JOIN bud ON bud.account_id = a.id
  LEFT JOIN act ON act.account_id = a.id
  WHERE a.holding_id = v_hold AND a.is_postable = true
    AND (bud.budget IS NOT NULL OR act.actual IS NOT NULL)
  ORDER BY a.code;
END $$;
