ALTER TABLE public.hr_payroll_policies
  ADD COLUMN IF NOT EXISTS engine_preset text NOT NULL DEFAULT 'standard';

ALTER TABLE public.hr_payroll_policies
  DROP CONSTRAINT IF EXISTS hr_payroll_policies_engine_preset_check;

ALTER TABLE public.hr_payroll_policies
  ADD CONSTRAINT hr_payroll_policies_engine_preset_check
  CHECK (engine_preset IN ('standard', 'malaki', 'custom'));

CREATE INDEX IF NOT EXISTS idx_hr_payroll_policies_engine_preset
  ON public.hr_payroll_policies(engine_preset);

COMMENT ON COLUMN public.hr_payroll_policies.engine_preset IS
  'Explicit payroll engine selector. Values: standard | malaki | custom. NEVER infer from company/policy name.';