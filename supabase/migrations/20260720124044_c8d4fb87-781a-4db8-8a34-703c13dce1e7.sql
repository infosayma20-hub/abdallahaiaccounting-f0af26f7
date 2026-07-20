ALTER TABLE public.termination_records
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE INDEX IF NOT EXISTS idx_termination_records_not_deleted
  ON public.termination_records (user_id, termination_date DESC)
  WHERE is_deleted = false;