-- HR managers get delete parity with admins on company templates
DROP POLICY IF EXISTS "Team admins can delete company templates" ON public.form_templates;
CREATE POLICY "Team admins can delete company templates"
ON public.form_templates FOR DELETE TO authenticated
USING (
  (user_id IS NOT NULL)
  AND public.is_team_member(auth.uid(), user_id)
  AND (public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'hr_manager'::public.app_role))
);

-- Explicit HR-manager access to submitted employee forms (view / update / delete)
CREATE POLICY "HR managers can view all company forms"
ON public.employee_forms FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  AND public.is_team_member(auth.uid(), user_id)
);

CREATE POLICY "HR managers can update all company forms"
ON public.employee_forms FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  AND public.is_team_member(auth.uid(), user_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  AND public.is_team_member(auth.uid(), user_id)
);

CREATE POLICY "HR managers can delete company forms"
ON public.employee_forms FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  AND public.is_team_member(auth.uid(), user_id)
);

-- HR managers can manage form approvals / shares within their tenant
CREATE POLICY "HR managers manage form approvals"
ON public.employee_form_approvals FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
       OR public.has_role(auth.uid(), 'admin'::public.app_role));
