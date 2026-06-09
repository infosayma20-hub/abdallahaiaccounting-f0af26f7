-- Backfill onboarding_completed for established tenants who never went through the wizard.
-- Criteria: the tenant has any meaningful operational data (chart of accounts seeded
-- beyond defaults, or actual invoices / employees / contacts).
INSERT INTO public.company_profiles (company_id, onboarding_completed, onboarding_step)
SELECT c.id, true, 6
FROM public.companies c
LEFT JOIN public.company_profiles cp ON cp.company_id = c.id
WHERE cp.id IS NULL
  AND (
    (SELECT count(*) FROM public.accounts  a WHERE a.user_id = c.owner_id) > 5
 OR (SELECT count(*) FROM public.invoices  i WHERE i.user_id = c.owner_id) > 0
 OR (SELECT count(*) FROM public.employees e WHERE e.user_id = c.owner_id) > 0
 OR (SELECT count(*) FROM public.contacts  ct WHERE ct.user_id = c.owner_id) > 0
  )
ON CONFLICT (company_id) DO UPDATE
  SET onboarding_completed = true,
      onboarding_step = GREATEST(public.company_profiles.onboarding_step, 6);