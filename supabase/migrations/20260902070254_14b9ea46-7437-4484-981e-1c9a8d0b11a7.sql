CREATE OR REPLACE FUNCTION public.enforce_attendance_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  emp_owner uuid;
  branch_owner uuid;
  emp_branch uuid;
  allowed_count int;
  row_json jsonb;
  row_status text;
  branch_open boolean;
BEGIN
  row_json := to_jsonb(NEW);

  IF TG_OP = 'UPDATE' AND (row_json ? 'status') THEN
    row_status := row_json->>'status';
    IF row_status IN ('voided','invalid','rejected','cross_tenant_blocked') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.branch_id IS NULL OR NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, branch_id INTO emp_owner, emp_branch
  FROM public.employees WHERE id = NEW.employee_id;

  SELECT user_id, (require_gps IS FALSE) INTO branch_owner, branch_open
  FROM public.branches WHERE id = NEW.branch_id;

  IF emp_owner IS NULL OR branch_owner IS NULL THEN
    RAISE EXCEPTION 'Invalid employee or branch reference';
  END IF;

  IF emp_owner <> branch_owner THEN
    RAISE EXCEPTION 'Cross-tenant attendance is not allowed (employee % vs branch %)',
      emp_owner, branch_owner
      USING ERRCODE = 'check_violation';
  END IF;

  -- Open branches (temporary expo/booth branches with require_gps = false)
  -- are available to every employee of the same tenant: the static QR at the
  -- booth is the proof of presence, so branch pinning must not block them.
  IF COALESCE(branch_open, false) THEN
    RETURN NEW;
  END IF;

  IF emp_branch IS NOT NULL AND emp_branch <> NEW.branch_id THEN
    SELECT count(*) INTO allowed_count
    FROM public.employee_allowed_branches
    WHERE employee_id = NEW.employee_id AND branch_id = NEW.branch_id;

    IF allowed_count = 0 THEN
      RAISE EXCEPTION 'Employee is not assigned to this branch (not in allowed list)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;