CREATE POLICY "Assigned viewers can read template submissions"
ON public.employee_forms
FOR SELECT
TO authenticated
USING (
  template_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.form_template_assignments fta
    JOIN public.employees e ON e.id = fta.employee_id
    WHERE fta.template_id = employee_forms.template_id
      AND fta.is_active = true
      AND (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
  )
);