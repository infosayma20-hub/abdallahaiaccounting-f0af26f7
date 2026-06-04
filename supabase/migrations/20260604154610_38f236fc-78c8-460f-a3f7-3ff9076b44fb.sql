
-- 1) Integrity issues log
CREATE TABLE IF NOT EXISTS public.identity_integrity_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  issue_type text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.identity_integrity_issues TO authenticated;
GRANT ALL ON public.identity_integrity_issues TO service_role;
ALTER TABLE public.identity_integrity_issues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='identity_integrity_issues' AND policyname='admin_read_integrity_issues') THEN
    CREATE POLICY admin_read_integrity_issues ON public.identity_integrity_issues
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='identity_integrity_issues' AND policyname='self_insert_integrity_issues') THEN
    CREATE POLICY self_insert_integrity_issues ON public.identity_integrity_issues
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- 2) resolve_account_type
CREATE OR REPLACE FUNCTION public.resolve_account_type(_uid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_emp boolean;
  v_pos record;
  v_portal boolean;
  v_invited uuid;
  v_has_accounts boolean;
BEGIN
  IF _uid IS NULL THEN RETURN 'unlinked'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='super_admin') INTO v_is_super;
  IF v_is_super THEN RETURN 'super_admin'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.employees
    WHERE auth_user_id=_uid AND is_active=true AND COALESCE(is_terminated,false)=false
  ) INTO v_emp;

  SELECT is_active, is_call_center INTO v_pos
  FROM public.pos_users WHERE auth_user_id=_uid LIMIT 1;

  SELECT EXISTS(
    SELECT 1 FROM public.malaki_portal_users
    WHERE auth_user_id=_uid AND COALESCE(is_active,true)=true
  ) INTO v_portal;

  -- sub-account precedence
  IF v_pos.is_active = true AND v_pos.is_call_center = true THEN RETURN 'call_center'; END IF;
  IF v_pos.is_active = true THEN RETURN 'cashier'; END IF;
  IF v_portal THEN RETURN 'portal_user'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='sales_rep') THEN RETURN 'sales_rep'; END IF;
  IF v_emp THEN RETURN 'employee'; END IF;

  SELECT invited_by INTO v_invited FROM public.profiles WHERE user_id=_uid LIMIT 1;
  IF v_invited IS NOT NULL AND v_invited <> _uid THEN RETURN 'company_admin'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.accounts WHERE user_id=_uid) INTO v_has_accounts;
  IF v_has_accounts THEN RETURN 'company_owner'; END IF;

  RETURN 'unlinked';
END;
$$;

-- 3) user_can_access_setup
CREATE OR REPLACE FUNCTION public.user_can_access_setup(_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_has_perm boolean;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  v_type := public.resolve_account_type(_uid);

  -- Owner always allowed. Unlinked allowed (first-time signup creating a tenant).
  IF v_type IN ('company_owner', 'unlinked') THEN RETURN true; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_feature_permissions
    WHERE target_user_id=_uid AND app_key='manage_company_setup' AND access_state='allow'
  ) INTO v_has_perm;
  RETURN COALESCE(v_has_perm, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_account_type(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_setup(uuid) TO authenticated, anon, service_role;

-- 4) Trigger: block tenant seed by sub-accounts
CREATE OR REPLACE FUNCTION public.guard_tenant_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  -- Only check on INSERT and only when user_id is the auth uid of the inserter.
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  -- Don't block service_role (migrations, admin scripts)
  IF auth.uid() IS NULL OR auth.uid() <> NEW.user_id THEN RETURN NEW; END IF;

  v_type := public.resolve_account_type(NEW.user_id);

  IF v_type IN ('employee','cashier','call_center','sales_rep','portal_user','company_admin') THEN
    INSERT INTO public.identity_integrity_issues(auth_user_id, issue_type, context)
    VALUES (NEW.user_id, 'tenant_seed_blocked_for_subaccount',
            jsonb_build_object('table', TG_TABLE_NAME, 'account_type', v_type));
    RAISE EXCEPTION 'tenant_seed_blocked_for_subaccount: account type % cannot create tenant rows in %', v_type, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tenant_seed_accounts ON public.accounts;
CREATE TRIGGER trg_guard_tenant_seed_accounts
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_seed();
