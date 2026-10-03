DROP POLICY IF EXISTS admins_view_company_broadcasts ON public.notification_broadcasts;
CREATE POLICY admins_view_company_broadcasts ON public.notification_broadcasts
FOR SELECT TO authenticated
USING (
  sent_by = (SELECT auth.uid())
  OR (
    (has_role((SELECT auth.uid()), 'admin'::app_role)
     OR has_role((SELECT auth.uid()), 'hr_manager'::app_role)
     OR has_role((SELECT auth.uid()), 'super_admin'::app_role))
    AND get_team_owner_id(sent_by) = (SELECT get_team_owner_id((SELECT auth.uid())))
  )
);