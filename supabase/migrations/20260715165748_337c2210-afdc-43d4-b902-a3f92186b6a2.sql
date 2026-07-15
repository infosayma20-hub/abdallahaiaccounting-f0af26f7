
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_intake_auto_managed              boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_advance_intake_schedule_enabled  boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_advance_intake_open_day          smallint,
  ADD COLUMN IF NOT EXISTS hr_advance_intake_close_day         smallint,
  ADD COLUMN IF NOT EXISTS hr_leave_intake_schedule_enabled    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_leave_intake_open_day            smallint,
  ADD COLUMN IF NOT EXISTS hr_leave_intake_close_day           smallint,
  ADD COLUMN IF NOT EXISTS hr_payroll_freeze_enabled           boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_payroll_freeze_days_before       smallint NOT NULL DEFAULT 5;

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS hr_intake_days_range_chk;
ALTER TABLE public.company_settings
  ADD CONSTRAINT hr_intake_days_range_chk CHECK (
    (hr_advance_intake_open_day  IS NULL OR hr_advance_intake_open_day  BETWEEN 1 AND 31) AND
    (hr_advance_intake_close_day IS NULL OR hr_advance_intake_close_day BETWEEN 1 AND 31) AND
    (hr_leave_intake_open_day    IS NULL OR hr_leave_intake_open_day    BETWEEN 1 AND 31) AND
    (hr_leave_intake_close_day   IS NULL OR hr_leave_intake_close_day   BETWEEN 1 AND 31) AND
    (hr_payroll_freeze_days_before BETWEEN 0 AND 15)
  );
