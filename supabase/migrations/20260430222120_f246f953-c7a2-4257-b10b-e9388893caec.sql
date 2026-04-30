-- S2-A.3: Add payroll policy linkage on employees (read-only Settings UI prep)
-- لا يؤثر على PayrollPage الحالية، فقط يخزّن الربط والـ overrides حتى يقرأها المحرك القياسي لاحقاً عند Live Test.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS payroll_policy_id uuid NULL REFERENCES public.hr_payroll_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_employees_payroll_policy_id ON public.employees(payroll_policy_id);

COMMENT ON COLUMN public.employees.payroll_policy_id IS 'Optional FK to hr_payroll_policies. Used by Standard payroll engine. Read-only in S2-A.3 (Settings UI), not yet wired to PayrollPage.';
COMMENT ON COLUMN public.employees.payroll_overrides IS 'Per-employee overrides for policy components, e.g. {"COMP_CODE": 250}. Read by Standard engine when calculating preview.';
