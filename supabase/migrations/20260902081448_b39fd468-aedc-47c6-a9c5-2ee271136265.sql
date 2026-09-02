-- 1) Repair existing rows written with the wrong auth_user_id (owner instead of employee login)
UPDATE public.attendance_days d
SET auth_user_id = e.auth_user_id
FROM public.employees e
WHERE e.id = d.employee_id
  AND e.auth_user_id IS NOT NULL
  AND d.auth_user_id IS DISTINCT FROM e.auth_user_id;

UPDATE public.attendance_events v
SET auth_user_id = e.auth_user_id
FROM public.employees e
WHERE e.id = v.employee_id
  AND e.auth_user_id IS NOT NULL
  AND v.auth_user_id IS DISTINCT FROM e.auth_user_id;

-- 2) Permanent guard: always bind attendance rows to the employee's login account
CREATE OR REPLACE FUNCTION public.enforce_attendance_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth uuid;
BEGIN
  SELECT e.auth_user_id INTO v_auth FROM public.employees e WHERE e.id = NEW.employee_id;
  IF v_auth IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM v_auth THEN
    NEW.auth_user_id := v_auth;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_days_auth_user ON public.attendance_days;
CREATE TRIGGER trg_attendance_days_auth_user
BEFORE INSERT OR UPDATE OF employee_id, auth_user_id ON public.attendance_days
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_auth_user();

DROP TRIGGER IF EXISTS trg_attendance_events_auth_user ON public.attendance_events;
CREATE TRIGGER trg_attendance_events_auth_user
BEFORE INSERT OR UPDATE OF employee_id, auth_user_id ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_auth_user();

-- 3) When an employee's login account is (re)linked, re-bind their history
CREATE OR REPLACE FUNCTION public.sync_attendance_auth_user_on_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    UPDATE public.attendance_days SET auth_user_id = NEW.auth_user_id WHERE employee_id = NEW.id;
    UPDATE public.attendance_events SET auth_user_id = NEW.auth_user_id WHERE employee_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_auth_user_attendance_sync ON public.employees;
CREATE TRIGGER trg_employee_auth_user_attendance_sync
AFTER UPDATE OF auth_user_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_attendance_auth_user_on_employee();