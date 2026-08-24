ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_delivery_enabled boolean,
  ADD COLUMN IF NOT EXISTS pos_employee_meals_enabled boolean,
  ADD COLUMN IF NOT EXISTS pos_loyalty_enabled boolean;

-- تثبيت الملكي صراحة على وضع مطعم بكل الميزات — حماية من أي تغيير مستقبلي بالافتراضيات
UPDATE public.company_settings
SET pos_mode = 'restaurant',
    pos_tables_enabled = true,
    pos_call_center_enabled = true,
    pos_delivery_enabled = true,
    pos_employee_meals_enabled = true,
    pos_loyalty_enabled = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'malakybroast@gmail.com');