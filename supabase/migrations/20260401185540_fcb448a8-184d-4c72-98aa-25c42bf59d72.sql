
-- Add missing columns to plans table
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_branches INTEGER DEFAULT 1;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS ai_limit INTEGER DEFAULT NULL;

-- Update all plans with correct data
UPDATE public.plans SET 
  is_active = true, sort_order = 1, annual_price = 182, max_branches = 1,
  is_featured = false, ai_limit = 50,
  features = '["المحاسبة الأساسية","حتى 500 معاملة شهرياً","فواتير المبيعات والمشتريات","تقارير أساسية (10 تقارير)","مستخدمان","شركة واحدة","المحاسب الذكي (50 رسالة/يوم)","دعم بريد إلكتروني"]'::jsonb
WHERE plan_key = 'starter';

UPDATE public.plans SET 
  is_active = true, sort_order = 2, monthly_price = 39, annual_price = 374,
  max_users = 3, max_companies = 1, max_branches = 1,
  is_featured = false, ai_limit = NULL,
  features = '["كل ما في Starter","تقارير متقدمة وذكية","تحليل أداء KPI","تصدير Excel / PDF","تنبيهات ذكية"]'::jsonb
WHERE plan_key = 'growth';

UPDATE public.plans SET 
  is_active = true, sort_order = 3, monthly_price = 49, annual_price = 470,
  max_users = 10, max_companies = 3, max_branches = 3,
  is_featured = true, ai_limit = NULL,
  features = '["كل مميزات المبتدئ","معاملات غير محدودة","حتى 10 مستخدمين","حتى 3 شركات","جميع التقارير (63+ تقرير)","نقطة البيع POS","إدارة المخزون","إدارة الموارد البشرية","المحاسب الذكي بلا حدود","تحليلات متقدمة","دعم أولوية 24/7","وصول API"]'::jsonb
WHERE plan_key = 'professional';

UPDATE public.plans SET 
  is_active = true, sort_order = 4, monthly_price = 79, annual_price = 758,
  max_users = -1, max_companies = -1, max_branches = -1,
  is_featured = false, ai_limit = NULL,
  features = '["كل مميزات Professional","مستخدمون وشركات غير محدود","إدارة متعددة الفروع","صلاحيات متقدمة","تكامل API","تقارير مخصصة"]'::jsonb
WHERE plan_key = 'business';

UPDATE public.plans SET 
  is_active = true, sort_order = 5, monthly_price = 129, annual_price = 1238,
  max_users = -1, max_companies = -1, max_branches = -1,
  is_featured = false, ai_limit = NULL,
  features = '["كل مميزات Business","White-label","مدير حساب مخصص","تدريب شخصي","اتفاقية SLA","نسخ احتياطي يومي"]'::jsonb
WHERE plan_key = 'enterprise';

-- Create add_ons table
CREATE TABLE IF NOT EXISTS public.add_ons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  addon_key TEXT NOT NULL UNIQUE,
  price_per_unit_annual NUMERIC NOT NULL DEFAULT 0,
  price_per_unit_monthly NUMERIC NOT NULL DEFAULT 0,
  unit_label TEXT NOT NULL,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.add_ons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active addons" ON public.add_ons FOR SELECT USING (true);

-- Seed add-ons
INSERT INTO public.add_ons (addon_key, name_ar, name_en, price_per_unit_annual, price_per_unit_monthly, unit_label, icon, sort_order)
VALUES
  ('extra_payroll', 'كشف رواتب', 'Payroll', 120, 10, 'موظف / سنة', '$', 1),
  ('extra_pos', 'نقاط البيع', 'POS', 600, 50, 'مستخدم / سنة', '🖥️', 2),
  ('extra_users', 'مستخدمين', 'Extra Users', 240, 20, 'مستخدم / سنة', '👥', 3),
  ('extra_branches', 'مواقع', 'Branches', 480, 40, 'موقع / سنة', '📍', 4)
ON CONFLICT (addon_key) DO UPDATE SET
  price_per_unit_annual = EXCLUDED.price_per_unit_annual,
  price_per_unit_monthly = EXCLUDED.price_per_unit_monthly,
  unit_label = EXCLUDED.unit_label;
