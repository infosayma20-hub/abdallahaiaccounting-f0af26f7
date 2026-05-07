CREATE OR REPLACE FUNCTION public.enforce_attendance_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  emp_owner uuid;
  branch_owner uuid;
  emp_branch uuid;
BEGIN
  -- Allow administrative voiding/invalidating of existing rows for audit trail
  IF TG_OP = 'UPDATE' AND NEW.status IN ('voided','invalid','rejected','cross_tenant_blocked') THEN
    RETURN NEW;
  END IF;

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
$function$;