
ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS payslip_number text;

CREATE UNIQUE INDEX IF NOT EXISTS employee_payroll_payslip_number_key
  ON public.employee_payroll (payslip_number)
  WHERE payslip_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_payslip_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  seq_num int;
BEGIN
  IF NEW.payslip_number IS NULL THEN
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(payslip_number, '^PS-\d{4}-\d{2}-', ''), '')::int
    ), 0) + 1
    INTO seq_num
    FROM public.employee_payroll
    WHERE period_year = NEW.period_year
      AND period_month = NEW.period_month
      AND payslip_number ~ ('^PS-' || NEW.period_year || '-' || lpad(NEW.period_month::text, 2, '0') || '-');

    NEW.payslip_number := 'PS-' || NEW.period_year || '-' || lpad(NEW.period_month::text, 2, '0') || '-' || lpad(seq_num::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_payslip_number ON public.employee_payroll;
CREATE TRIGGER trg_set_payslip_number
  BEFORE INSERT ON public.employee_payroll
  FOR EACH ROW EXECUTE FUNCTION public.set_payslip_number();

-- Backfill existing rows
WITH ordered AS (
  SELECT id, period_year, period_month,
    row_number() OVER (PARTITION BY period_year, period_month ORDER BY created_at, id) AS rn
  FROM public.employee_payroll
  WHERE payslip_number IS NULL
)
UPDATE public.employee_payroll p
SET payslip_number = 'PS-' || o.period_year || '-' || lpad(o.period_month::text, 2, '0') || '-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE p.id = o.id;
