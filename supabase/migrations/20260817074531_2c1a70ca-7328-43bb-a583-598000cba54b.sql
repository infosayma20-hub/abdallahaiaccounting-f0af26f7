ALTER TABLE public.employee_form_referrals
  ADD COLUMN IF NOT EXISTS form_title text,
  ADD COLUMN IF NOT EXISTS form_type text,
  ADD COLUMN IF NOT EXISTS submitter_name text,
  ADD COLUMN IF NOT EXISTS form_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;