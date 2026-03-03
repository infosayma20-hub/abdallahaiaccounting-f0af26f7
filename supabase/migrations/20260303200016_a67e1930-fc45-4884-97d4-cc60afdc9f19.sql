
-- Plans table
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  monthly_price NUMERIC NOT NULL DEFAULT 0,
  annual_discount_pct NUMERIC NOT NULL DEFAULT 20,
  max_users INTEGER NOT NULL DEFAULT 1,
  max_companies INTEGER NOT NULL DEFAULT 1,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'cancelled', 'suspended')),
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Plans are readable by everyone
CREATE POLICY "Plans are publicly readable" ON public.plans FOR SELECT USING (true);

-- Only super_admin can manage plans
CREATE POLICY "Super admins can manage plans" ON public.plans FOR ALL USING (public.is_super_admin(auth.uid()));

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own subscription
CREATE POLICY "Users can create own subscription" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Super admins can manage all subscriptions
CREATE POLICY "Super admins manage subscriptions" ON public.subscriptions FOR ALL USING (public.is_super_admin(auth.uid()));

-- Seed default plans
INSERT INTO public.plans (plan_key, name, name_ar, monthly_price, annual_discount_pct, max_users, max_companies, features, display_order) VALUES
('starter', 'Starter', 'المبتدئ', 19, 20, 1, 1, '["مبيعات ومشتريات","إدارة العملاء والموردين","إدخال ذكي بالعربية","قيود يومية تلقائية","تقارير مالية أساسية"]'::jsonb, 1),
('growth', 'Growth', 'النمو', 39, 20, 3, 1, '["كل ما في Starter","تقارير متقدمة وذكية","KPI وتحليل أداء","تصدير Excel / PDF","تنبيهات ذكية"]'::jsonb, 2),
('business', 'Business', 'الأعمال', 79, 20, -1, -1, '["كل ما في Growth","تعدد شركات","صلاحيات مستخدمين متقدمة","دعم أولوية","تكامل API","نسخ احتياطي متقدم"]'::jsonb, 3);

-- Triggers
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
