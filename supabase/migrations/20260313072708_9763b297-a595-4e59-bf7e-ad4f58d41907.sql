
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_annual_leave_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS hr_sick_leave_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS hr_carry_over_leave boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_salary_day integer DEFAULT 28,
  ADD COLUMN IF NOT EXISTS hr_salary_currency text DEFAULT 'ILS',
  ADD COLUMN IF NOT EXISTS hr_social_security boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_require_qr boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_require_gps boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS hr_shift_start text DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS hr_shift_end text DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS hr_late_grace_minutes integer DEFAULT 15;
