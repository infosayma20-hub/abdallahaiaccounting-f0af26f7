
-- Run payroll for a month: creates a draft run + lines for active employees
CREATE OR REPLACE FUNCTION public.sparta_run_payroll(p_year integer, p_month integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := sparta_holding_id();
  v_run uuid;
  v_emp record;
  v_adv numeric;
  v_gross numeric;
  v_net numeric;
  v_total_gross numeric := 0;
  v_total_ded numeric := 0;
  v_total_net numeric := 0;
BEGIN
  IF NOT is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.sparta_payroll_runs (company_id, period_year, period_month, status, created_by)
  VALUES (v_company, p_year, p_month, 'draft', auth.uid())
  ON CONFLICT (company_id, period_year, period_month) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_run;

  -- Clear old draft lines
  DELETE FROM public.sparta_payroll_lines WHERE run_id = v_run;

  FOR v_emp IN
    SELECT id, basic_salary, currency FROM public.sparta_employees
    WHERE company_id = v_company AND status = 'active'
  LOOP
    SELECT COALESCE(SUM(LEAST(monthly_deduction, amount_remaining)), 0)
      INTO v_adv
      FROM public.sparta_employee_advances
     WHERE employee_id = v_emp.id AND status = 'active';

    v_gross := COALESCE(v_emp.basic_salary, 0);
    v_net := GREATEST(v_gross - v_adv, 0);

    INSERT INTO public.sparta_payroll_lines (
      company_id, run_id, employee_id, basic, advances_deducted, gross, net, currency
    ) VALUES (
      v_company, v_run, v_emp.id, v_gross, v_adv, v_gross, v_net, v_emp.currency
    );

    v_total_gross := v_total_gross + v_gross;
    v_total_ded := v_total_ded + v_adv;
    v_total_net := v_total_net + v_net;
  END LOOP;

  UPDATE public.sparta_payroll_runs
     SET total_gross = v_total_gross,
         total_deductions = v_total_ded,
         total_net = v_total_net,
         updated_at = now()
   WHERE id = v_run;

  RETURN v_run;
END $$;

GRANT EXECUTE ON FUNCTION public.sparta_run_payroll(integer, integer) TO authenticated;

-- Post payroll: lock the run and reduce advances
CREATE OR REPLACE FUNCTION public.sparta_post_payroll(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := sparta_holding_id();
  v_line record;
  v_left numeric;
BEGIN
  IF NOT is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM 1 FROM public.sparta_payroll_runs
   WHERE id = p_run_id AND company_id = v_company AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found or already posted'; END IF;

  FOR v_line IN
    SELECT employee_id, advances_deducted FROM public.sparta_payroll_lines WHERE run_id = p_run_id
  LOOP
    v_left := v_line.advances_deducted;
    IF v_left > 0 THEN
      UPDATE public.sparta_employee_advances
         SET amount_remaining = GREATEST(amount_remaining - LEAST(monthly_deduction, amount_remaining), 0),
             status = CASE WHEN amount_remaining - LEAST(monthly_deduction, amount_remaining) <= 0 THEN 'closed' ELSE status END,
             updated_at = now()
       WHERE employee_id = v_line.employee_id AND status = 'active';
    END IF;
  END LOOP;

  UPDATE public.sparta_payroll_runs
     SET status = 'posted', posted_at = now(), posted_by = auth.uid(), updated_at = now()
   WHERE id = p_run_id;
END $$;

GRANT EXECUTE ON FUNCTION public.sparta_post_payroll(uuid) TO authenticated;

-- Project profitability
CREATE OR REPLACE FUNCTION public.sparta_project_profitability(p_project_id uuid)
RETURNS TABLE(revenue numeric, expenses numeric, profit numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := sparta_holding_id();
  v_rev numeric := 0;
  v_exp numeric := 0;
BEGIN
  IF NOT is_sparta_holding_member(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(SUM(i.total), 0) INTO v_rev
    FROM public.sparta_project_invoices_link l
    JOIN public.sparta_invoices i ON i.id = l.invoice_id
   WHERE l.project_id = p_project_id AND l.company_id = v_company AND i.status <> 'cancelled';

  SELECT COALESCE(SUM(amount), 0) INTO v_exp
    FROM public.sparta_project_expenses
   WHERE project_id = p_project_id AND company_id = v_company;

  RETURN QUERY SELECT v_rev, v_exp, (v_rev - v_exp);
END $$;

GRANT EXECUTE ON FUNCTION public.sparta_project_profitability(uuid) TO authenticated;

-- Convert opportunity to project
CREATE OR REPLACE FUNCTION public.sparta_convert_opportunity_to_project(p_opp_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := sparta_holding_id();
  v_opp record;
  v_project uuid;
BEGIN
  IF NOT is_sparta_holding_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_opp FROM public.sparta_opportunities
   WHERE id = p_opp_id AND company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opportunity not found'; END IF;

  INSERT INTO public.sparta_projects (
    company_id, name, customer_id, manager_id, budget, currency,
    description, status, start_date, created_by
  ) VALUES (
    v_company, v_opp.title, v_opp.customer_id, v_opp.assigned_to,
    COALESCE(v_opp.amount, 0), COALESCE(v_opp.currency, 'ILS'),
    'محوّل من فرصة CRM رقم ' || p_opp_id::text, 'planned', current_date, auth.uid()
  ) RETURNING id INTO v_project;

  RETURN v_project;
END $$;

GRANT EXECUTE ON FUNCTION public.sparta_convert_opportunity_to_project(uuid) TO authenticated;
