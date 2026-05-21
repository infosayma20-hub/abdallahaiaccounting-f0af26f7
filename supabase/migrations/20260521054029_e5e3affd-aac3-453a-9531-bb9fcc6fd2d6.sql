-- =========================================================
-- USER FEATURE PERMISSIONS — صلاحيات داخل التطبيق
-- =========================================================

-- 1) جدول overrides لكل مستخدم
CREATE TABLE IF NOT EXISTS public.user_feature_permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid,
  company_id      uuid,
  target_user_id  uuid NOT NULL,
  app_key         text NOT NULL,
  feature_key     text NOT NULL,
  permission_key  text NOT NULL,
  access_state    text NOT NULL CHECK (access_state IN ('allow','deny')),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_user_id, app_key, feature_key, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_ufp_target ON public.user_feature_permissions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_ufp_company ON public.user_feature_permissions(company_id);
CREATE INDEX IF NOT EXISTS idx_ufp_app ON public.user_feature_permissions(app_key);

-- 2) جدول افتراضيات الأدوار
CREATE TABLE IF NOT EXISTS public.role_default_feature_permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            text NOT NULL,                  -- مثل 'admin','accountant_senior','cashier'
  app_key         text NOT NULL,
  feature_key     text NOT NULL,
  permission_key  text NOT NULL,
  allowed         boolean NOT NULL DEFAULT false,
  UNIQUE (role, app_key, feature_key, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_rdfp_role ON public.role_default_feature_permissions(role);

ALTER TABLE public.role_default_feature_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rdfp_select_all ON public.role_default_feature_permissions;
CREATE POLICY rdfp_select_all ON public.role_default_feature_permissions
FOR SELECT TO authenticated USING (true);

-- 3) Trigger: تعبئة الـ meta من target
CREATE OR REPLACE FUNCTION public.ufp_fill_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_owner   uuid;
BEGIN
  SELECT company_id, COALESCE(invited_by, company_id, user_id)
    INTO v_company, v_owner
    FROM public.profiles
   WHERE user_id = NEW.target_user_id
   LIMIT 1;

  NEW.company_id := COALESCE(NEW.company_id, v_company);
  NEW.owner_id   := COALESCE(NEW.owner_id, v_owner);
  NEW.updated_at := now();
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ufp_fill_meta ON public.user_feature_permissions;
CREATE TRIGGER trg_ufp_fill_meta
BEFORE INSERT OR UPDATE ON public.user_feature_permissions
FOR EACH ROW EXECUTE FUNCTION public.ufp_fill_meta();

-- 4) Trigger: audit
CREATE OR REPLACE FUNCTION public.ufp_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text; v_new text;
  v_target uuid; v_app text; v_feat text; v_perm text; v_company uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := OLD.access_state; v_new := 'inherit';
    v_target := OLD.target_user_id; v_app := OLD.app_key;
    v_feat := OLD.feature_key; v_perm := OLD.permission_key; v_company := OLD.company_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := 'inherit'; v_new := NEW.access_state;
    v_target := NEW.target_user_id; v_app := NEW.app_key;
    v_feat := NEW.feature_key; v_perm := NEW.permission_key; v_company := NEW.company_id;
  ELSE
    v_old := OLD.access_state; v_new := NEW.access_state;
    v_target := NEW.target_user_id; v_app := NEW.app_key;
    v_feat := NEW.feature_key; v_perm := NEW.permission_key; v_company := NEW.company_id;
  END IF;

  BEGIN
    INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, entity_label, details, created_at)
    VALUES (
      auth.uid(),
      'update_user_feature_permission',
      'user_feature_permission',
      v_target,
      v_app || '.' || v_feat || '.' || v_perm,
      jsonb_build_object(
        'app_key', v_app, 'feature_key', v_feat, 'permission_key', v_perm,
        'old', v_old, 'new', v_new, 'company_id', v_company
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_ufp_audit ON public.user_feature_permissions;
CREATE TRIGGER trg_ufp_audit
AFTER INSERT OR UPDATE OR DELETE ON public.user_feature_permissions
FOR EACH ROW EXECUTE FUNCTION public.ufp_audit();

-- 5) RLS — نفس نمط uaao المتشدد (admin/super_admin فقط للكتابة، السوبر-أدمن لا يحتاج same-company)
ALTER TABLE public.user_feature_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ufp_select ON public.user_feature_permissions;
CREATE POLICY ufp_select ON public.user_feature_permissions
FOR SELECT TO authenticated
USING (
  target_user_id = auth.uid()
  OR (public.uaao_is_actor_admin(auth.uid()) AND public.uaao_can_admin_target(auth.uid(), target_user_id))
);

DROP POLICY IF EXISTS ufp_insert ON public.user_feature_permissions;
CREATE POLICY ufp_insert ON public.user_feature_permissions
FOR INSERT TO authenticated
WITH CHECK (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS ufp_update ON public.user_feature_permissions;
CREATE POLICY ufp_update ON public.user_feature_permissions
FOR UPDATE TO authenticated
USING (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
)
WITH CHECK (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS ufp_delete ON public.user_feature_permissions;
CREATE POLICY ufp_delete ON public.user_feature_permissions
FOR DELETE TO authenticated
USING (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

-- 6) دالة الحصول على الحالة الفعلية: 'allow' | 'deny' | 'inherit'
CREATE OR REPLACE FUNCTION public.get_feature_permission_state(
  _user uuid, _app text, _feature text, _perm text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT access_state
    FROM public.user_feature_permissions
   WHERE target_user_id = _user
     AND app_key = _app
     AND feature_key = _feature
     AND permission_key = _perm
   LIMIT 1;
$$;

-- 7) دالة الفحص النهائية
CREATE OR REPLACE FUNCTION public.has_feature_permission(
  _user uuid, _app text, _feature text, _perm text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_role_allow boolean;
BEGIN
  -- super_admin يتجاوز كل شيء
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user AND role = 'super_admin') THEN
    RETURN true;
  END IF;

  -- override يدوي
  v_state := public.get_feature_permission_state(_user, _app, _feature, _perm);
  IF v_state = 'deny' THEN RETURN false; END IF;
  IF v_state = 'allow' THEN RETURN true; END IF;

  -- inherit → أعلى افتراضي بين أدوار المستخدم
  SELECT bool_or(rdfp.allowed) INTO v_role_allow
  FROM public.user_roles ur
  JOIN public.role_default_feature_permissions rdfp
    ON rdfp.role = ur.role::text
   AND rdfp.app_key = _app
   AND rdfp.feature_key = _feature
   AND rdfp.permission_key = _perm
  WHERE ur.user_id = _user;

  RETURN COALESCE(v_role_allow, false);
END;
$$;

-- 8) Seed افتراضيات الأدوار
-- admin: كل شيء مفتوح (نسجل صفوف لأهم التطبيقات)
DO $seed$
DECLARE
  app text; feat text; perm text;
  apps text[] := ARRAY['sales','purchases','pos','finance','settings','inventory','hr','reports'];
BEGIN
  -- admin = full access على كل تطبيق+ميزة+صلاحية مذكورة لاحقاً (نضيف صفوف اشتقاقية بعد seed accountant/cashier)
  NULL;
END
$seed$;

-- البذور التفصيلية (شريحة Phase 1):
INSERT INTO public.role_default_feature_permissions (role, app_key, feature_key, permission_key, allowed) VALUES
-- ===== admin =====
('admin','sales','invoices','view',true),('admin','sales','invoices','create',true),('admin','sales','invoices','update',true),
('admin','sales','invoices','delete',true),('admin','sales','invoices','cancel',true),('admin','sales','invoices','print',true),('admin','sales','invoices','export',true),
('admin','sales','customers','view',true),('admin','sales','customers','create',true),('admin','sales','customers','update',true),('admin','sales','customers','delete',true),
('admin','purchases','purchase_invoices','view',true),('admin','purchases','purchase_invoices','create',true),('admin','purchases','purchase_invoices','update',true),
('admin','purchases','purchase_invoices','delete',true),('admin','purchases','purchase_invoices','print',true),('admin','purchases','purchase_invoices','export',true),
('admin','purchases','suppliers','view',true),('admin','purchases','suppliers','create',true),('admin','purchases','suppliers','update',true),('admin','purchases','suppliers','delete',true),
('admin','pos','sell','view',true),('admin','pos','sell','create_order',true),('admin','pos','sell','discount',true),('admin','pos','sell','change_price',true),
('admin','pos','sell','refund',true),('admin','pos','sell','open_drawer',true),('admin','pos','sell','close_shift',true),('admin','pos','sell','print_receipt',true),
('admin','pos','kds','manage',true),
('admin','finance','receipts','view',true),('admin','finance','receipts','create',true),('admin','finance','receipts','update',true),('admin','finance','receipts','delete',true),('admin','finance','receipts','print',true),
('admin','finance','payments','view',true),('admin','finance','payments','create',true),('admin','finance','payments','update',true),('admin','finance','payments','delete',true),('admin','finance','payments','print',true),
('admin','finance','journal','view',true),('admin','finance','journal','create',true),('admin','finance','journal','update',true),('admin','finance','journal','delete',true),('admin','finance','journal','approve',true),
('admin','settings','users','manage',true),('admin','settings','roles','manage',true),('admin','settings','company','update',true),('admin','settings','pos_settings','update',true),('admin','settings','app_permissions','manage',true),

-- ===== accountant_senior =====
('accountant_senior','sales','invoices','view',true),('accountant_senior','sales','invoices','create',true),('accountant_senior','sales','invoices','update',true),
('accountant_senior','sales','invoices','delete',false),('accountant_senior','sales','invoices','cancel',true),('accountant_senior','sales','invoices','print',true),('accountant_senior','sales','invoices','export',true),
('accountant_senior','sales','customers','view',true),('accountant_senior','sales','customers','create',true),('accountant_senior','sales','customers','update',true),('accountant_senior','sales','customers','delete',false),
('accountant_senior','purchases','purchase_invoices','view',true),('accountant_senior','purchases','purchase_invoices','create',true),('accountant_senior','purchases','purchase_invoices','update',true),
('accountant_senior','purchases','purchase_invoices','delete',false),('accountant_senior','purchases','purchase_invoices','print',true),('accountant_senior','purchases','purchase_invoices','export',true),
('accountant_senior','purchases','suppliers','view',true),('accountant_senior','purchases','suppliers','create',true),('accountant_senior','purchases','suppliers','update',true),('accountant_senior','purchases','suppliers','delete',false),
('accountant_senior','finance','receipts','view',true),('accountant_senior','finance','receipts','create',true),('accountant_senior','finance','receipts','update',true),('accountant_senior','finance','receipts','delete',false),('accountant_senior','finance','receipts','print',true),
('accountant_senior','finance','payments','view',true),('accountant_senior','finance','payments','create',true),('accountant_senior','finance','payments','update',true),('accountant_senior','finance','payments','delete',false),('accountant_senior','finance','payments','print',true),
('accountant_senior','finance','journal','view',true),('accountant_senior','finance','journal','create',true),('accountant_senior','finance','journal','update',true),('accountant_senior','finance','journal','delete',false),('accountant_senior','finance','journal','approve',false),

-- ===== cashier =====
('cashier','pos','sell','view',true),('cashier','pos','sell','create_order',true),('cashier','pos','sell','discount',false),('cashier','pos','sell','change_price',false),
('cashier','pos','sell','refund',false),('cashier','pos','sell','open_drawer',true),('cashier','pos','sell','close_shift',true),('cashier','pos','sell','print_receipt',true),
('cashier','sales','invoices','view',true),('cashier','sales','invoices','print',true)
ON CONFLICT (role, app_key, feature_key, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed;