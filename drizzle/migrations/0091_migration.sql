CREATE OR REPLACE FUNCTION public.list_internal_message_people()
RETURNS TABLE(auth_user_id uuid, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH o AS (SELECT COALESCE(public.get_team_owner_id(auth.uid()), auth.uid()) AS owner_id),
  ppl AS (
    SELECT p.user_id AS uid, COALESCE(NULLIF(p.full_name,''), NULLIF(p.display_name,''), 'بدون اسم') AS nm
    FROM profiles p, o WHERE p.user_id = o.owner_id OR p.invited_by = o.owner_id
    UNION ALL
    SELECT e.auth_user_id, COALESCE(NULLIF(e.full_name,''),'موظف')
    FROM employees e, o WHERE e.user_id = o.owner_id AND e.auth_user_id IS NOT NULL AND COALESCE(e.is_active,true)
  )
  SELECT DISTINCT ON (uid) uid, nm,
    (SELECT r.role::text FROM user_roles r WHERE r.user_id = ppl.uid LIMIT 1)
  FROM ppl WHERE auth.uid() IS NOT NULL AND uid IS NOT NULL
  ORDER BY uid, nm;
$$;
REVOKE ALL ON FUNCTION public.list_internal_message_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_internal_message_people() TO authenticated;