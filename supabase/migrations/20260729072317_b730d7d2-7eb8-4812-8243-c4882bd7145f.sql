CREATE OR REPLACE FUNCTION public.can_manage_employee_files(_viewer uuid, _employee_auth uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.auth_user_id = _employee_auth
      AND e.user_id = public.get_team_owner_id(_viewer)
      AND (
        e.user_id = _viewer
        OR public.has_role(_viewer, 'admin'::app_role)
        OR public.has_role(_viewer, 'super_admin'::app_role)
        OR public.has_role(_viewer, 'hr_manager'::app_role)
      )
  )
$$;

DROP POLICY IF EXISTS "HR and admins can read employee-forms attachments" ON storage.objects;
CREATE POLICY "HR and admins can read employee-forms attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-forms'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.can_manage_employee_files(auth.uid(), ((storage.foldername(name))[1])::uuid)
);