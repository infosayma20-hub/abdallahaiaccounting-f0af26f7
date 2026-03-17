ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS fingerprint_id INTEGER;
COMMENT ON COLUMN public.employees.fingerprint_id IS 'رقم البصمة في جهاز ZKTeco - يستخدم لربط سجلات الحضور';