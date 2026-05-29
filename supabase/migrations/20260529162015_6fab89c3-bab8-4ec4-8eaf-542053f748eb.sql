DROP POLICY IF EXISTS departments_select_own ON public.departments;

CREATE POLICY departments_select_tenant_members
ON public.departments
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
      AND e.user_id = departments.user_id
      AND COALESCE(e.is_active, true) = true
      AND COALESCE(e.is_terminated, false) = false
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.invited_by = departments.user_id
  )
);