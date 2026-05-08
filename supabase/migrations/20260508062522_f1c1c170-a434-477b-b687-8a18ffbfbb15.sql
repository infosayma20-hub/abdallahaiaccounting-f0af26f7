CREATE OR REPLACE FUNCTION public.is_managed_branch_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees emp
    JOIN public.branch_manager_assignments bma
      ON bma.branch_id = emp.branch_id
    WHERE emp.id = _employee_id
      AND bma.user_id = auth.uid()
      AND emp.is_active = true
  );
$$;

DROP POLICY IF EXISTS "branch_manager_view_branch_employees" ON public.employees;
CREATE POLICY "branch_manager_view_branch_employees"
ON public.employees
FOR SELECT
TO authenticated
USING (public.is_managed_branch_employee(id));