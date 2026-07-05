
-- 1) Backfill NULL branch_id on active employees (never overwrite existing)
UPDATE public.employees e
SET branch_id = COALESCE(
  (SELECT eab.branch_id FROM public.employee_allowed_branches eab
    WHERE eab.employee_id = e.id LIMIT 1),
  (SELECT b.id FROM public.branches b
    WHERE b.user_id = e.user_id ORDER BY b.created_at ASC LIMIT 1)
)
WHERE e.branch_id IS NULL
  AND e.is_active = true
  AND EXISTS (SELECT 1 FROM public.branches b WHERE b.user_id = e.user_id);

-- 2) Auto-assign trigger: if branch_id is NULL on insert/update, pick a safe default
CREATE OR REPLACE FUNCTION public.autoassign_employee_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(
      (SELECT eab.branch_id FROM public.employee_allowed_branches eab
        WHERE eab.employee_id = NEW.id LIMIT 1),
      (SELECT b.id FROM public.branches b
        WHERE b.user_id = NEW.user_id ORDER BY b.created_at ASC LIMIT 1)
    ) INTO NEW.branch_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autoassign_employee_branch ON public.employees;
CREATE TRIGGER trg_autoassign_employee_branch
BEFORE INSERT OR UPDATE OF branch_id, user_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.autoassign_employee_branch();
