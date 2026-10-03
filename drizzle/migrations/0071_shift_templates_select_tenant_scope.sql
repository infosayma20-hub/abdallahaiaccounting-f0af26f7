DROP POLICY IF EXISTS shift_templates_select ON public.shift_templates;
CREATE POLICY shift_templates_select ON public.shift_templates FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM employees e WHERE e.auth_user_id = (SELECT auth.uid()) AND e.company_id = shift_templates.company_id)
  OR EXISTS (SELECT 1 FROM branch_manager_assignments b WHERE b.user_id = (SELECT auth.uid()) AND b.company_id = shift_templates.company_id)
  OR (has_role((SELECT auth.uid()),'admin'::app_role)
      AND EXISTS (SELECT 1 FROM companies c WHERE c.id = shift_templates.company_id AND is_team_member((SELECT auth.uid()), c.owner_id)))
);