ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_advance_max_amount numeric,
  ADD COLUMN IF NOT EXISTS hr_advance_limit_exempt_employees uuid[] NOT NULL DEFAULT '{}'::uuid[];