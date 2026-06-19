
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS meal_monthly_cap_family NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_monthly_cap_individual NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_monthly_warn_at_pct SMALLINT NOT NULL DEFAULT 80
    CHECK (meal_monthly_warn_at_pct BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS auto_journal_for_meals BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_company_share_account_code TEXT,
  ADD COLUMN IF NOT EXISTS meal_employee_payable_account_code TEXT;

CREATE OR REPLACE FUNCTION public.get_employee_meal_monthly_totals(
  p_employee_id UUID,
  p_year INT,
  p_month INT
)
RETURNS TABLE (meal_discount_type TEXT, total NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(efm.meal_discount_type, 'unknown')::text AS meal_discount_type,
         COALESCE(SUM(efm.amount), 0)::numeric AS total
  FROM public.employee_financial_movements efm
  WHERE efm.employee_id = p_employee_id
    AND efm.source_type = 'pos_meal'
    AND efm.salary_year = p_year
    AND efm.salary_month = p_month
  GROUP BY efm.meal_discount_type;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_meal_monthly_totals(UUID, INT, INT) TO authenticated;
