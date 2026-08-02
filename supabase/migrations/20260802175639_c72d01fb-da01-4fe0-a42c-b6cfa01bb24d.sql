CREATE OR REPLACE FUNCTION public.get_google_signups()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  created_at timestamptz,
  last_sign_in_at timestamptz
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
    u.created_at,
    u.last_sign_in_at
  FROM auth.identities i
  JOIN auth.users u ON u.id = i.user_id
  WHERE i.provider = 'google'
  ORDER BY COALESCE(u.last_sign_in_at, u.created_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_google_signups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_google_signups() TO authenticated, service_role;