ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS hr_recommendation text,
  ADD COLUMN IF NOT EXISTS hr_recommendation_notes text,
  ADD COLUMN IF NOT EXISTS hr_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS hr_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_decided_by uuid,
  ADD COLUMN IF NOT EXISTS final_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_decision_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_forms_hr_recommendation_check'
  ) THEN
    ALTER TABLE public.employee_forms
      ADD CONSTRAINT employee_forms_hr_recommendation_check
      CHECK (hr_recommendation IS NULL OR hr_recommendation IN ('approve','reject'));
  END IF;
END $$;