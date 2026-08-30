ALTER TABLE public.form_template_assignments
ADD COLUMN source_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE CASCADE;

CREATE INDEX idx_form_template_assignments_source_employee
ON public.form_template_assignments (template_id, employee_id, source_employee_id)
WHERE is_active = true;

DROP POLICY IF EXISTS "Assigned viewers can read template submissions" ON public.employee_forms;
CREATE POLICY "Assigned viewers can read template submissions"
ON public.employee_forms
FOR SELECT
TO authenticated
USING (
  template_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.form_template_assignments fta
    JOIN public.employees viewer ON viewer.id = fta.employee_id
    WHERE fta.template_id = employee_forms.template_id
      AND fta.is_active = true
      AND (viewer.auth_user_id = (SELECT auth.uid()) OR viewer.user_id = (SELECT auth.uid()))
      AND (fta.source_employee_id IS NULL OR fta.source_employee_id = employee_forms.employee_id)
  )
  AND public.can_view_complaint_row((SELECT auth.uid()), form_type, complaint_target)
);