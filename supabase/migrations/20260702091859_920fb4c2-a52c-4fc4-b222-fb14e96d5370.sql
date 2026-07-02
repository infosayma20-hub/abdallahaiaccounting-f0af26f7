
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_allow_advance_requests BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hr_allow_leave_requests BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hr_advance_requests_closed_message TEXT,
  ADD COLUMN IF NOT EXISTS hr_leave_requests_closed_message TEXT;
