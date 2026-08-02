CREATE OR REPLACE FUNCTION public.wl_find_user_by_email(p_email text)
RETURNS TABLE(user_id uuid, email text, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.email::text,
         COALESCE(p.full_name, p.display_name, (u.raw_user_meta_data->>'full_name'))::text
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wl_find_user_by_email(text) TO authenticated;