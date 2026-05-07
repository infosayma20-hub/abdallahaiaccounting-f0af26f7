
-- 1) Disable auto penalties in payroll policy
UPDATE public.hr_payroll_policies
SET 
  late_calculation = 'none',
  absence_calculation = 'none',
  overtime_after_hours = 99,
  updated_at = now()
WHERE company_id = 'b4a221be-7b96-4952-8eb8-6ca749b46ca4';

-- 2) Lock company HR settings to manual + QR mandatory
UPDATE public.company_settings
SET 
  hr_require_qr = true,
  hr_require_gps = false,
  hr_late_grace_minutes = 60,
  updated_at = now()
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73';
