
-- Helper: does the current user manage the branch of a given form's employee?
CREATE OR REPLACE FUNCTION public.user_manages_form_branch(_form_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_forms f
    JOIN public.employees e ON e.id = f.employee_id
    JOIN public.branch_manager_assignments bma
      ON bma.branch_id = e.branch_id
     AND bma.user_id = auth.uid()
    WHERE f.id = _form_id
  );
$$;

-- employee_forms: allow branch managers to SELECT forms of employees in their managed branches
CREATE POLICY "Branch managers can view forms in their branches"
ON public.employee_forms
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branch_manager_assignments bma
      ON bma.branch_id = e.branch_id
     AND bma.user_id = auth.uid()
    WHERE e.id = employee_forms.employee_id
  )
);

-- form_section_assignments: allow branch managers to fully manage assignments for forms in their branches
CREATE POLICY "Branch managers manage section assignments"
ON public.form_section_assignments
FOR ALL
TO authenticated
USING (public.user_manages_form_branch(form_id))
WITH CHECK (public.user_manages_form_branch(form_id));
