ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS management_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS management_seen_by UUID REFERENCES auth.users(id);