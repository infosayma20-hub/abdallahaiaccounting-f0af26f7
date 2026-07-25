-- Allow the employee's data owner (and HR managers) to view their employees' payroll rows,
-- so the HR salary slip pulls the exact same row the employee sees in the portal.
CREATE POLICY "Data owner can view employees payroll"
ON public.employee_payroll
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_payroll.employee_id
      AND e.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);