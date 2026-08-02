DROP FUNCTION IF EXISTS public.get_google_signups();

CREATE OR REPLACE FUNCTION public.get_google_signups()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  phone text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  sign_in_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR auth.uid() = 'a26051b0-2904-4dbc-ab41-d171ae2d69be'::uuid
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(i.identity_data->>'full_name', ''),
      NULLIF(i.identity_data->>'name', '')
    ),
    COALESCE(
      NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(i.identity_data->>'avatar_url', '')
    ),
    i.provider::text,
    COALESCE(
      NULLIF(u.phone::text, ''),
      NULLIF(u.raw_user_meta_data->>'phone', ''),
      NULLIF(u.raw_user_meta_data->>'phone_number', ''),
      NULLIF(i.identity_data->>'phone', ''),
      NULLIF(i.identity_data->>'phone_number', '')
    ),
    u.created_at,
    u.last_sign_in_at,
    COALESCE(l.cnt, 0)::bigint
  FROM auth.identities i
  JOIN auth.users u ON u.id = i.user_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM auth.audit_log_entries a
    WHERE (a.payload->>'actor_id') = u.id::text
      AND (a.payload->>'action') = 'login'
  ) l ON TRUE
  WHERE i.provider = 'google'
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_google_signups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_google_signups() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_login_history(_user_id uuid, _limit int DEFAULT 50)
RETURNS TABLE (
  occurred_at timestamptz,
  action text,
  ip_address text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR auth.uid() = 'a26051b0-2904-4dbc-ab41-d171ae2d69be'::uuid
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    a.created_at,
    (a.payload->>'action')::text,
    NULLIF(a.ip_address::text, '')
  FROM auth.audit_log_entries a
  WHERE (a.payload->>'actor_id') = _user_id::text
    AND (a.payload->>'action') IN ('login','logout','user_signedup','token_refreshed')
  ORDER BY a.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_login_history(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_login_history(uuid, int) TO authenticated, service_role;