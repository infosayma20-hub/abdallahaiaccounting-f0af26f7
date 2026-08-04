ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS management_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS management_seen_by uuid;