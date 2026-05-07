-- Defense-in-depth: prevent cross-tenant attendance at the database layer
CREATE OR REPLACE FUNCTION public.enforce_attendance_tenant_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_owner uuid;
  branch_owner uuid;
  emp_branch uuid;
BEGIN
  IF NEW.branch_id IS NULL OR NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, branch_id INTO emp_owner, emp_branch
  FROM public.employees WHERE id = NEW.employee_id;

  SELECT user_id INTO branch_owner
  FROM public.branches WHERE id = NEW.branch_id;

  IF emp_owner IS NULL OR branch_owner IS NULL THEN
    RAISE EXCEPTION 'Invalid employee or branch reference';
  END IF;

  IF emp_owner <> branch_owner THEN
    RAISE EXCEPTION 'Cross-tenant attendance is not allowed (employee % vs branch %)',
      emp_owner, branch_owner
      USING ERRCODE = 'check_violation';
  END IF;

  IF emp_branch IS NOT NULL AND emp_branch <> NEW.branch_id THEN
    RAISE EXCEPTION 'Employee is not assigned to this branch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_events_tenant_guard ON public.attendance_events;
CREATE TRIGGER trg_attendance_events_tenant_guard
BEFORE INSERT OR UPDATE OF employee_id, branch_id ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_tenant_match();

DROP TRIGGER IF EXISTS trg_attendance_days_tenant_guard ON public.attendance_days;
CREATE TRIGGER trg_attendance_days_tenant_guard
BEFORE INSERT OR UPDATE OF employee_id, branch_id ON public.attendance_days
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_tenant_match();

DROP TRIGGER IF EXISTS trg_attendance_breaks_tenant_guard ON public.attendance_breaks;
CREATE TRIGGER trg_attendance_breaks_tenant_guard
BEFORE INSERT OR UPDATE OF employee_id, branch_id ON public.attendance_breaks
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_tenant_match();