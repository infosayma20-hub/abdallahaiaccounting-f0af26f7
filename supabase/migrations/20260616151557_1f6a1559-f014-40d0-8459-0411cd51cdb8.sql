
-- Make form_id nullable so branch managers can pre-assign sections from a template
-- without requiring a submitted employee form.
ALTER TABLE public.form_section_assignments
  ALTER COLUMN form_id DROP NOT NULL;

-- Update trigger to handle form_id IS NULL (template-planning mode).
CREATE OR REPLACE FUNCTION public.set_form_section_assignment_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_form_user_id uuid;
  v_form_company_id uuid;
  v_emp_user_id uuid;
  v_emp_company_id uuid;
  v_emp_auth uuid;
BEGIN
  IF NEW.form_id IS NOT NULL AND (NEW.user_id IS NULL OR NEW.company_id IS NULL) THEN
    SELECT user_id, company_id INTO v_form_user_id, v_form_company_id
    FROM public.employee_forms WHERE id = NEW.form_id;
    IF NEW.user_id IS NULL THEN NEW.user_id := v_form_user_id; END IF;
    IF NEW.company_id IS NULL THEN NEW.company_id := v_form_company_id; END IF;
  END IF;

  -- Template-planning mode (form_id NULL): derive from assignee employee
  IF (NEW.user_id IS NULL OR NEW.company_id IS NULL) AND NEW.assignee_employee_id IS NOT NULL THEN
    SELECT user_id, company_id INTO v_emp_user_id, v_emp_company_id
    FROM public.employees WHERE id = NEW.assignee_employee_id;
    IF NEW.user_id IS NULL THEN NEW.user_id := v_emp_user_id; END IF;
    IF NEW.company_id IS NULL THEN NEW.company_id := v_emp_company_id; END IF;
  END IF;

  IF NEW.assignee_auth_user_id IS NULL AND NEW.assignee_employee_id IS NOT NULL THEN
    SELECT auth_user_id INTO v_emp_auth FROM public.employees WHERE id = NEW.assignee_employee_id;
    NEW.assignee_auth_user_id := v_emp_auth;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_by IS NULL THEN
    NEW.assigned_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$function$;

-- Helper: current user is a branch manager of the assignee's branch
CREATE OR REPLACE FUNCTION public.user_manages_employee_branch(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branch_manager_assignments bma
      ON bma.branch_id = e.branch_id
     AND bma.user_id = auth.uid()
    WHERE e.id = _employee_id
  );
$function$;

-- Allow branch managers to manage template-level (form_id NULL) assignments for employees in their branches.
DROP POLICY IF EXISTS "Branch managers manage template section assignments" ON public.form_section_assignments;
CREATE POLICY "Branch managers manage template section assignments"
ON public.form_section_assignments
FOR ALL
USING (
  form_id IS NULL
  AND assignee_employee_id IS NOT NULL
  AND public.user_manages_employee_branch(assignee_employee_id)
)
WITH CHECK (
  form_id IS NULL
  AND assignee_employee_id IS NOT NULL
  AND public.user_manages_employee_branch(assignee_employee_id)
);
