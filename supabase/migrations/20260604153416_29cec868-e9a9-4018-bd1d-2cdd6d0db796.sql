CREATE OR REPLACE FUNCTION public.get_team_owner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.invited_by
     FROM public.profiles p
     WHERE p.user_id = _user_id
       AND p.invited_by IS NOT NULL
     LIMIT 1),
    (SELECT e.user_id
     FROM public.employees e
     WHERE e.auth_user_id = _user_id
       AND e.is_active = true
       AND COALESCE(e.is_terminated, false) = false
     LIMIT 1),
    (SELECT pu.user_id
     FROM public.pos_users pu
     WHERE pu.auth_user_id = _user_id
       AND COALESCE(pu.is_active, true) = true
     LIMIT 1),
    (SELECT mpu.user_id
     FROM public.malaki_portal_users mpu
     WHERE mpu.auth_user_id = _user_id
       AND COALESCE(mpu.is_active, true) = true
     LIMIT 1),
    _user_id
  )
$$;