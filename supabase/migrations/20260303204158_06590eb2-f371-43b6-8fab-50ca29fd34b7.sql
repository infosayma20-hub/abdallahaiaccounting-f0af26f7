
-- ══════════════════════════════════════════════════════════
-- PHASE 1: Companies table + company_id in profiles
-- ══════════════════════════════════════════════════════════

-- 1.1 Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'شركتي',
  owner_id UUID NOT NULL,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company"
  ON public.companies FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can update their own company"
  ON public.companies FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own company"
  ON public.companies FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Service role needs full access for triggers
CREATE POLICY "Service role full access on companies"
  ON public.companies FOR ALL
  USING (true)
  WITH CHECK (true);

-- 1.2 Add company_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- 1.3 Create companies for all existing users who don't have one
DO $$
DECLARE
  profile_rec RECORD;
  new_company_id UUID;
BEGIN
  FOR profile_rec IN 
    SELECT user_id, display_name, company_name 
    FROM public.profiles 
    WHERE company_id IS NULL
  LOOP
    new_company_id := gen_random_uuid();
    INSERT INTO public.companies (id, name, owner_id, created_at)
    VALUES (
      new_company_id,
      COALESCE(NULLIF(profile_rec.company_name, ''), profile_rec.display_name || ' - شركة', 'شركتي'),
      profile_rec.user_id,
      now()
    );
    UPDATE public.profiles 
    SET company_id = new_company_id,
        company_name = COALESCE(NULLIF(profile_rec.company_name, ''), profile_rec.display_name || ' - شركة', 'شركتي')
    WHERE user_id = profile_rec.user_id;
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════
-- PHASE 2: Clean up roles - single role per user
-- ══════════════════════════════════════════════════════════

-- 2.1 Add role column to profiles with proper type
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';

-- 2.2 Set role on profiles based on user_roles table (pick highest priority role)
UPDATE public.profiles p
SET role = COALESCE(
  (SELECT CASE 
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'super_admin') THEN 'super_admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'accountant_senior') THEN 'accountant'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'cashier') THEN 'cashier'
    ELSE 'admin'
  END),
  'admin'
);

-- 2.3 Remove duplicate roles - keep only one per user (the highest priority)
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.user_id = b.user_id 
  AND a.id > b.id
  AND a.role != 'super_admin';

-- Remove employee roles for users who also have admin
DELETE FROM public.user_roles 
WHERE role = 'employee' 
  AND user_id IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin'));

-- ══════════════════════════════════════════════════════════
-- PHASE 3: Subscriptions for all existing users
-- ══════════════════════════════════════════════════════════

-- 3.1 Get the trial/starter plan ID (or use first plan)
DO $$
DECLARE
  trial_plan_id UUID;
  profile_rec RECORD;
BEGIN
  -- Find the starter/free plan
  SELECT id INTO trial_plan_id FROM public.plans WHERE plan_key = 'starter' LIMIT 1;
  IF trial_plan_id IS NULL THEN
    SELECT id INTO trial_plan_id FROM public.plans ORDER BY monthly_price ASC LIMIT 1;
  END IF;
  
  -- Create trial subscription for each user without one
  FOR profile_rec IN
    SELECT p.user_id, p.company_id
    FROM public.profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.user_id)
  LOOP
    INSERT INTO public.subscriptions (user_id, plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end)
    VALUES (
      profile_rec.user_id,
      trial_plan_id,
      'monthly',
      'trial',
      now() + INTERVAL '14 days',
      now(),
      now() + INTERVAL '14 days'
    );
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════
-- PHASE 4: Trigger for new user registration
-- ══════════════════════════════════════════════════════════

-- 4.1 Update the handle_new_user function to create company + subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_company_id UUID;
  trial_plan_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name, company_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركتي'),
    'admin'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create company
  new_company_id := gen_random_uuid();
  INSERT INTO public.companies (id, name, owner_id)
  VALUES (
    new_company_id,
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركتي'),
    NEW.id
  );

  -- Link company to profile
  UPDATE public.profiles 
  SET company_id = new_company_id
  WHERE user_id = NEW.id;

  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create trial subscription
  SELECT id INTO trial_plan_id FROM public.plans WHERE plan_key = 'starter' LIMIT 1;
  IF trial_plan_id IS NULL THEN
    SELECT id INTO trial_plan_id FROM public.plans ORDER BY monthly_price ASC LIMIT 1;
  END IF;
  
  IF trial_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end)
    VALUES (NEW.id, trial_plan_id, 'monthly', 'trial', now() + INTERVAL '14 days', now(), now() + INTERVAL '14 days');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if any, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════
-- PHASE 5: Allow super-admin API to browse companies table
-- ══════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.companies;
