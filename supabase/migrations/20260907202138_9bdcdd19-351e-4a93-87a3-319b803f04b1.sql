ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;
CREATE INDEX IF NOT EXISTS idx_job_applications_archived ON public.job_applications (user_id, archived_at);