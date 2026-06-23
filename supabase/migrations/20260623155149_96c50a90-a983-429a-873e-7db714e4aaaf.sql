CREATE POLICY "Team members can view tenant payroll settings"
ON public.payroll_settings
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT id FROM public.companies
    WHERE owner_id = public.resolve_effective_owner_id(auth.uid())
  )
);