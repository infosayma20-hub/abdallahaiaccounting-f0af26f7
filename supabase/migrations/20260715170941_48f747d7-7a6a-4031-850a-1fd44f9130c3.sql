
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_advance_intake_schedule_mode text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS hr_advance_intake_weekdays      smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hr_leave_intake_schedule_mode   text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS hr_leave_intake_weekdays        smallint[] NOT NULL DEFAULT '{}';

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS hr_intake_schedule_mode_chk;
ALTER TABLE public.company_settings
  ADD CONSTRAINT hr_intake_schedule_mode_chk CHECK (
    hr_advance_intake_schedule_mode IN ('monthly','weekly') AND
    hr_leave_intake_schedule_mode   IN ('monthly','weekly')
  );
