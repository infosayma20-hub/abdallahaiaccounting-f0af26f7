-- Allow HR team members (invited users) to view/manage leaves under the owner's account.
-- Fixes: HR manager device showing 0 used leaves while owner sees actual values.

CREATE POLICY "Team can view leaves"
  ON public.employee_leaves
  FOR SELECT
  USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "Team can insert leaves"
  ON public.employee_leaves
  FOR INSERT
  WITH CHECK (
    public.is_team_member((SELECT auth.uid()), user_id)
    AND public.user_can_access((SELECT auth.uid()), 'hr')
  );

CREATE POLICY "Team can update leaves"
  ON public.employee_leaves
  FOR UPDATE
  USING (
    public.is_team_member((SELECT auth.uid()), user_id)
    AND public.user_can_access((SELECT auth.uid()), 'hr')
  );

CREATE POLICY "Team can delete leaves"
  ON public.employee_leaves
  FOR DELETE
  USING (
    public.is_team_member((SELECT auth.uid()), user_id)
    AND (
      public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'hr_manager'::app_role)
    )
  );
