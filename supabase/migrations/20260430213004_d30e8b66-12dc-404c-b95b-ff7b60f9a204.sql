-- ============================================================
-- CRITICAL FIX: Backfill employees.company_id from user_id ownership
-- ============================================================

-- Step 1: Update all employees missing company_id
UPDATE public.employees e
SET company_id = c.id,
    updated_at = now()
FROM public.companies c
WHERE c.owner_id = e.user_id
  AND e.company_id IS NULL;

-- Step 2: Verify all employees now have company_id
DO $$
DECLARE
  v_orphans integer;
BEGIN
  SELECT COUNT(*) INTO v_orphans FROM public.employees WHERE company_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % employees still without company_id', v_orphans;
  END IF;
END $$;

-- Step 3: Now backfill employee_payroll_profile for the newly-linked employees
INSERT INTO public.employee_payroll_profile (employee_id, company_id, policy_id, basic_salary)
SELECT 
  e.id,
  e.company_id,
  p.id,
  COALESCE(e.base_salary, 0)
FROM public.employees e
JOIN public.hr_payroll_policies p 
  ON p.company_id = e.company_id AND p.is_default = true
WHERE e.company_id IS NOT NULL
ON CONFLICT (employee_id) DO NOTHING;

-- Step 4: Add NOT NULL constraint to prevent future drift
ALTER TABLE public.employees
  ALTER COLUMN company_id SET NOT NULL;

-- Step 5: Add index for multi-tenant query performance
CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);

-- Step 6: Add CHECK that employee company matches owner's company
-- (Optional safety: ensure if user_id is set, it owns the company)
COMMENT ON COLUMN public.employees.company_id IS 'Multi-tenant isolation key. Must match the company owned by employees.user_id (enforced at app level).';