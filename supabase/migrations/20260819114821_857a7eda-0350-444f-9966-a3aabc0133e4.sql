ALTER TABLE public.builtin_form_assignments
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'fill';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'builtin_form_assignments_access_level_check'
  ) THEN
    ALTER TABLE public.builtin_form_assignments
      ADD CONSTRAINT builtin_form_assignments_access_level_check
      CHECK (access_level IN ('fill','view'));
  END IF;
END $$;

ALTER TABLE public.builtin_form_assignments
  DROP CONSTRAINT IF EXISTS builtin_form_assignments_employee_id_form_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS builtin_form_assignments_emp_key_level_uidx
  ON public.builtin_form_assignments (employee_id, form_key, access_level);

CREATE POLICY "Assigned viewers can read builtin submissions"
ON public.employee_forms
FOR SELECT
USING (
  template_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.builtin_form_assignments bfa
    JOIN public.employees e ON e.id = bfa.employee_id
    WHERE bfa.is_active = true
      AND bfa.access_level = 'view'
      AND bfa.form_key = employee_forms.form_type
      AND bfa.user_id = employee_forms.user_id
      AND (e.auth_user_id = (SELECT auth.uid()) OR e.user_id = (SELECT auth.uid()))
  )
  AND can_view_complaint_row((SELECT auth.uid()), form_type, complaint_target)
);