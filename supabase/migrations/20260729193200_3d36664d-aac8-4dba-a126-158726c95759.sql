CREATE POLICY "Portal owners can view company templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  user_id IS NOT NULL
  AND is_team_member(auth.uid(), user_id)
  AND (
    has_role(auth.uid(), 'portal'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  )
);

CREATE POLICY "Portal owners can view system templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  is_system = true
  AND is_deleted = false
  AND (
    has_role(auth.uid(), 'portal'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  )
);