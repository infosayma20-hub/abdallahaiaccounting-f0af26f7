-- ============================================
-- 1) إضافة الأعمدة الجديدة لجدول plans
-- ============================================
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS max_users integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_invoices_per_month integer DEFAULT -1,
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS is_recommended boolean DEFAULT false;

-- ============================================
-- 2) تحديث الباقات الـ 5 الموجودة بـ enabled_modules
-- ============================================

-- Starter & Growth → basic tier
UPDATE public.plans
SET tier = 'basic',
    max_users = 3,
    max_invoices_per_month = 100,
    enabled_modules = ARRAY[
      'dashboard','finance','sales','purchases','inventory','accounting',
      'reports','contacts','tax','fixed-assets','currencies'
    ]
WHERE plan_key IN ('starter','growth');

-- Professional → pro tier
UPDATE public.plans
SET tier = 'pro',
    max_users = 10,
    max_invoices_per_month = -1,
    enabled_modules = ARRAY[
      'dashboard','finance','sales','purchases','inventory','accounting',
      'reports','contacts','tax','fixed-assets','currencies',
      'pos','hr','tasks','ai-accountant'
    ]
WHERE plan_key = 'professional';

-- Business → pro tier (recommended)
UPDATE public.plans
SET tier = 'pro',
    max_users = 25,
    max_invoices_per_month = -1,
    is_recommended = true,
    enabled_modules = ARRAY[
      'dashboard','finance','sales','purchases','inventory','accounting',
      'reports','contacts','tax','fixed-assets','currencies',
      'pos','hr','tasks','ai-accountant',
      'workshops','contracting','warranty'
    ]
WHERE plan_key = 'business';

-- Enterprise → enterprise tier (كل شي)
UPDATE public.plans
SET tier = 'enterprise',
    max_users = -1,
    max_invoices_per_month = -1,
    enabled_modules = ARRAY[
      'dashboard','finance','sales','purchases','inventory','accounting',
      'reports','contacts','tax','fixed-assets','currencies',
      'pos','hr','tasks','ai-accountant',
      'workshops','contracting','warranty',
      'tourism','ecommerce','call-center','stores'
    ]
WHERE plan_key = 'enterprise';

-- ============================================
-- 3) إضافة notified_days لجدول subscriptions
-- ============================================
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS notified_days integer[] DEFAULT ARRAY[]::integer[];

-- ============================================
-- 4) دالة فحص التطبيق المتاح (Plan + Hidden Apps)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_module_enabled(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_modules text[];
  v_hidden text[];
  v_is_super_admin boolean;
BEGIN
  -- Super admin يتجاوز كل شي
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  ) INTO v_is_super_admin;
  IF v_is_super_admin THEN RETURN true; END IF;

  -- جلب حالة الاشتراك + التطبيقات المفعّلة في الباقة
  SELECT s.status, p.enabled_modules
    INTO v_status, v_modules
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = _user_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- لا يوجد اشتراك → ممنوع
  IF v_status IS NULL THEN RETURN false; END IF;

  -- الاشتراك منتهي → ممنوع (read-only)
  IF v_status = 'expired' THEN RETURN false; END IF;

  -- خلال Trial → كل التطبيقات مفتوحة
  IF v_status IN ('trial','trialing') THEN
    -- بس نتحقق من hidden_apps في company_settings
    SELECT (cs.hidden_apps)::text[] INTO v_hidden
    FROM public.company_settings cs
    WHERE cs.user_id = _user_id;
    
    IF v_hidden IS NOT NULL AND _module = ANY(v_hidden) THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- اشتراك نشط → نتحقق من enabled_modules + hidden_apps
  IF v_modules IS NULL OR NOT (_module = ANY(v_modules)) THEN
    RETURN false;
  END IF;

  -- نتحقق من hidden_apps (السوبر أدمن قفلها يدوياً)
  SELECT (cs.hidden_apps)::text[] INTO v_hidden
  FROM public.company_settings cs
  WHERE cs.user_id = _user_id;
  
  IF v_hidden IS NOT NULL AND _module = ANY(v_hidden) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ============================================
-- 5) دالة تحديث الاشتراكات المنتهية (للـ Cron)
-- ============================================
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.subscriptions
    SET status = 'expired', updated_at = now()
    WHERE status IN ('trial','trialing')
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_expired_count FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_expired_count,
    'ran_at', now()
  );
END;
$$;