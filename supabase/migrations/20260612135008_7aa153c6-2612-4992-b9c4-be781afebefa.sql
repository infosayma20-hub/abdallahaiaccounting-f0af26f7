CREATE POLICY "Employees can view their own payslips by linked employee record"
ON public.employee_payroll
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_payroll.employee_id
      AND e.auth_user_id = auth.uid()
  )
);