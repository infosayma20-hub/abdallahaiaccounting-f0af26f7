
-- ============================================================
-- Idle Logout V1: company-level session policy
-- ============================================================

-- 1) Add columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS session_warning_minutes integer NOT NULL DEFAULT 2;

-- Sanity bounds: 0 = disabled; max 24h
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_session_timeout_bounds;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_session_timeout_bounds
  CHECK (session_timeout_minutes >= 0 AND session_timeout_minutes <= 1440);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_session_warning_bounds;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_session_warning_bounds
  CHECK (session_warning_minutes >= 0 AND session_warning_minutes <= 60);

-- 2) Backfill from legacy per-user company_settings rows (owner-only).
--    company_settings rows are keyed by user_id; we pull each company's
--    owner row, if any, and copy its values into companies.*.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='company_settings'
      AND column_name='security_session_timeout'
  ) THEN
    UPDATE public.companies c
       SET session_timeout_minutes = COALESCE(cs.security_session_timeout, c.session_timeout_minutes),
           session_warning_minutes = COALESCE(cs.security_warning_minutes, c.session_warning_minutes)
      FROM public.company_settings cs
     WHERE cs.user_id = c.owner_id
       AND (cs.security_session_timeout IS NOT NULL
            OR cs.security_warning_minutes IS NOT NULL);
  END IF;
END $$;

-- 3) Reader: resolve effective policy for a given user.
--    Uses get_team_owner_id to walk sub-account → owner, then matches
--    the company. Falls back to (30, 2) for unlinked / no-company users.
CREATE OR REPLACE FUNCTION public.get_effective_session_policy(_uid uuid)
RETURNS TABLE (timeout_minutes integer, warning_minutes integer)
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
BEGIN
  IF _uid IS NULL THEN
    RETURN QUERY SELECT 30, 2;
    RETURN;
  END IF;

  -- Walk to tenant owner (handles employees + portal + invited admins).
  BEGIN
    v_owner := public.get_team_owner_id(_uid);
  EXCEPTION WHEN OTHERS THEN
    v_owner := _uid;
  END;

  -- Path A: employee with an explicit company_id on the employees row.
  SELECT e.company_id INTO v_company_id
    FROM public.employees e
   WHERE (e.auth_user_id = _uid OR e.user_id = _uid)
   LIMIT 1;

  -- Path B: company owned by the tenant owner.
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

  SELECT c.session_timeout_minutes, c.session_warning_minutes
    INTO v_timeout, v_warning
    FROM public.companies c
   WHERE c.id = v_company_id;

  RETURN QUERY SELECT COALESCE(v_timeout, 30), COALESCE(v_warning, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_session_policy(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_session_policy(uuid) TO authenticated;

-- 4) Writer: only company owner (or admin role) may update.
CREATE OR REPLACE FUNCTION public.update_company_session_policy(
  _timeout_minutes integer,
  _warning_minutes integer
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

  -- Resolve tenant owner
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

  -- Only the actual owner OR a user with admin role may update.
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_uid AND role IN ('admin','company_admin')
  ) INTO v_is_admin;

  IF v_uid <> COALESCE(v_owner, v_uid) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.companies
     SET session_timeout_minutes = _timeout_minutes,
         session_warning_minutes = _warning_minutes
   WHERE id = v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_company_session_policy(integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_company_session_policy(integer, integer) TO authenticated;

-- 5) Enable Realtime on companies so policy changes propagate to all tabs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'companies'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.companies';
  END IF;
END $$;

ALTER TABLE public.companies REPLICA IDENTITY FULL;
