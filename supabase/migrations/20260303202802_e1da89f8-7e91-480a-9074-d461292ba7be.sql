
-- المرحلة 1أ: إضافة الأدوار الجديدة فقط
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant_senior';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant_sales';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant_purchases';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';

-- إضافة حقل invited_by للملفات الشخصية
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_by uuid;
