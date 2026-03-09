
-- Extend plans table with new columns
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS annual_price numeric(10,2);
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS limits jsonb;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS sort_order integer;

-- Update plans with correct data
UPDATE public.plans SET is_active = false;

INSERT INTO public.plans (plan_key, name, name_ar, monthly_price, annual_price, currency, max_users, max_companies, features, limits, is_active, display_order, sort_order)
VALUES 
(
  'starter', 'Starter', 'المبتدئ', 19.00, 14.00, 'USD', 2, 1,
  '["المحاسبة الأساسية","حتى 500 معاملة شهرياً","فواتير المبيعات والمشتريات","تقارير أساسية (10 تقارير)","مستخدمان","شركة واحدة","المحاسب الذكي (50 رسالة/يوم)","دعم بريد إلكتروني"]'::jsonb,
  '{"users":2,"companies":1,"transactions_per_month":500,"storage_gb":2,"ai_messages_per_day":50}'::jsonb,
  true, 1, 1
),
(
  'professional', 'Professional', 'الاحترافي', 49.00, 37.00, 'USD', 10, 3,
  '["كل مميزات المبتدئ","معاملات غير محدودة","حتى 10 مستخدمين","حتى 3 شركات","جميع التقارير (63+ تقرير)","نقطة البيع POS","إدارة المخزون","إدارة الموارد البشرية","المحاسب الذكي بلا حدود","تحليلات متقدمة","دعم أولوية 24/7","API وصول"]'::jsonb,
  '{"users":10,"companies":3,"transactions_per_month":-1,"storage_gb":20,"ai_messages_per_day":-1}'::jsonb,
  true, 2, 2
),
(
  'enterprise', 'Enterprise', 'المؤسسي', 129.00, 97.00, 'USD', -1, -1,
  '["كل مميزات الاحترافي","مستخدمون وشركات غير محدودة","إدارة متعددة الفروع","صلاحيات متقدمة","تكامل مع ERP خارجي","تقارير مخصصة","تدريب شخصي","مدير حساب مخصص","SLA اتفاقية مستوى خدمة","نسخ احتياطي يومي","White-label (شعارك الخاص)"]'::jsonb,
  '{"users":-1,"companies":-1,"transactions_per_month":-1,"storage_gb":100,"ai_messages_per_day":-1}'::jsonb,
  true, 3, 3
)
ON CONFLICT (plan_key) DO UPDATE SET
  name = EXCLUDED.name,
  name_ar = EXCLUDED.name_ar,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  currency = EXCLUDED.currency,
  max_users = EXCLUDED.max_users,
  max_companies = EXCLUDED.max_companies,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  sort_order = EXCLUDED.sort_order;

-- Extend subscriptions table
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_key text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS auto_renew boolean DEFAULT true;

-- Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  amount numeric(10,2),
  currency text DEFAULT 'USD',
  status text DEFAULT 'pending',
  payment_method text,
  card_last4 text,
  card_brand text,
  gateway_ref text,
  gateway_response jsonb,
  invoice_number text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT TO authenticated USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));
CREATE POLICY "Users can insert own payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Create company_profiles table
CREATE TABLE IF NOT EXISTS public.company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) UNIQUE,
  business_type text,
  industry text,
  industry_ar text,
  has_employees boolean,
  employees_count text,
  annual_revenue text,
  accounting_experience text,
  primary_currency text DEFAULT 'ILS',
  country text DEFAULT 'PS',
  city text,
  business_goals text[],
  pain_points text[],
  referral_source text,
  onboarding_completed boolean DEFAULT false,
  onboarding_step integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own company profile" ON public.company_profiles FOR ALL TO authenticated USING (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())) WITH CHECK (company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid()));

-- Create superadmin_users table
CREATE TABLE IF NOT EXISTS public.superadmin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  role text DEFAULT 'superadmin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.superadmin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only superadmins can read" ON public.superadmin_users FOR SELECT TO authenticated USING (auth.uid() IN (SELECT id FROM public.superadmin_users));
