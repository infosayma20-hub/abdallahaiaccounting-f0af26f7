CREATE POLICY "Employees can view their employer company"
ON public.companies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.company_id = companies.id
      AND e.auth_user_id = auth.uid()
  )
);