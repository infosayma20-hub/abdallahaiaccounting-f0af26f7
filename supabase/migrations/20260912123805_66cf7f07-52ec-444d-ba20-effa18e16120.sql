ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS hr_hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_hidden_by uuid;

ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS hr_hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_hidden_by uuid;

CREATE INDEX IF NOT EXISTS idx_employee_forms_hr_hidden_at ON public.employee_forms (hr_hidden_at);
CREATE INDEX IF NOT EXISTS idx_correction_requests_hr_hidden_at ON public.correction_requests (hr_hidden_at);