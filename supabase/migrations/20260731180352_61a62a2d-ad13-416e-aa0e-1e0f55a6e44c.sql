ALTER TABLE public.correction_requests DROP CONSTRAINT IF EXISTS correction_requests_status_check;
ALTER TABLE public.correction_requests ADD CONSTRAINT correction_requests_status_check CHECK (status = ANY (ARRAY['pending','approved','rejected','read','responded','closed','cancelled','archived']));
ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS hr_recommendation text,
  ADD COLUMN IF NOT EXISTS hr_recommendation_notes text,
  ADD COLUMN IF NOT EXISTS hr_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.correction_requests DROP CONSTRAINT IF EXISTS correction_requests_hr_recommendation_check;
ALTER TABLE public.correction_requests ADD CONSTRAINT correction_requests_hr_recommendation_check CHECK (hr_recommendation IS NULL OR hr_recommendation = ANY (ARRAY['approve','reject']));