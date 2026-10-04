DROP POLICY IF EXISTS "HR managers can delete company forms" ON public.employee_forms;
DROP POLICY IF EXISTS "Admins can delete forms" ON public.employee_forms;
CREATE POLICY "Owner or admin can delete forms" ON public.employee_forms
FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (public.has_role((SELECT auth.uid()), 'admin'::app_role) AND public.is_team_member((SELECT auth.uid()), user_id))
  OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role)
);