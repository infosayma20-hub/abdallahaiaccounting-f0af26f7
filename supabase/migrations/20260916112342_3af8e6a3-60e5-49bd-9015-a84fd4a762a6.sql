ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS session_exempt_roles text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.get_effective_session_policy(_uid uuid)
RETURNS TABLE(timeout_minutes integer, warning_minutes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_company_id uuid;
  v_timeout integer;
  v_warning integer;
  v_exempt text[];
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT 30, 2;
    RETURN;
  END IF;

  BEGIN
    v_owner := public.get_team_owner_id(_uid);
  EXCEPTION WHEN OTHERS THEN
    v_owner := _uid;
  END;

  SELECT e.company_id INTO v_company_id
    FROM public.employees e
   WHERE (e.auth_user_id = _uid OR e.user_id = _uid)
   LIMIT 1;

  IF v_company_id IS NULL THEN
    SELECT c.id INTO v_company_id
      FROM public.companies c
     WHERE c.owner_id = COALESCE(v_owner, _uid)
     LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN QUERY SELECT 30, 2;
    RETURN;
  END IF;

  SELECT c.session_timeout_minutes, c.session_warning_minutes, c.session_exempt_roles
    INTO v_timeout, v_warning, v_exempt
    FROM public.companies c
   WHERE c.id = v_company_id;

  -- Role-based exemption: if the user holds any exempt role, disable the
  -- idle auto-logout for this user only (0 = disabled).
  IF v_exempt IS NOT NULL AND array_length(v_exempt, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = _uid
         AND ur.role::text = ANY (v_exempt)
    ) THEN
      RETURN QUERY SELECT 0, 0;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT COALESCE(v_timeout, 30), COALESCE(v_warning, 2);
END;
$$;

DROP FUNCTION IF EXISTS public.update_company_session_policy(integer, integer);

CREATE OR REPLACE FUNCTION public.update_company_session_policy(
  _timeout_minutes integer,
  _warning_minutes integer,
  _exempt_roles text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_company_id uuid;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF _timeout_minutes IS NULL OR _timeout_minutes < 0 OR _timeout_minutes > 1440 THEN
    RAISE EXCEPTION 'invalid_timeout';
  END IF;
  IF _warning_minutes IS NULL OR _warning_minutes < 0 OR _warning_minutes > 60 THEN
    RAISE EXCEPTION 'invalid_warning';
  END IF;
  IF _timeout_minutes > 0 AND _warning_minutes >= _timeout_minutes THEN
    RAISE EXCEPTION 'warning_must_be_less_than_timeout';
  END IF;

  BEGIN
    v_owner := public.get_team_owner_id(v_uid);
  EXCEPTION WHEN OTHERS THEN
    v_owner := v_uid;
  END;

  SELECT c.id INTO v_company_id
    FROM public.companies c
   WHERE c.owner_id = COALESCE(v_owner, v_uid)
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'no_company';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_uid AND role IN ('admin','super_admin')
  ) INTO v_is_admin;

  IF v_uid <> COALESCE(v_owner, v_uid) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.companies
     SET session_timeout_minutes = _timeout_minutes,
         session_warning_minutes = _warning_minutes,
         session_exempt_roles = COALESCE(_exempt_roles, session_exempt_roles)
   WHERE id = v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_company_session_policy(integer, integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_company_session_policy(integer, integer, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_session_policy(uuid) TO authenticated, service_role;