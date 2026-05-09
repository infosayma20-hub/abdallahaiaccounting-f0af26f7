
-- Add visibility flag for team schedule sharing in employee portal
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS show_in_employee_team_schedule boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.show_in_employee_team_schedule IS
  'When true, this employee''s weekly roster (shift name + times only) is visible to other employees in the same company via the employee portal Team Schedule feature.';

-- Safe read-only RPC: returns only roster rows for visible, active employees in the caller''s company.
CREATE OR REPLACE FUNCTION public.get_employee_team_schedule(
  _start_date date,
  _end_date date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  department text,
  branch_id uuid,
  branch_name text,
  roster_date date,
  status text,
  shift_template_id uuid,
  shift_name text,
  shift_color text,
  start_time time,
  end_time time
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date THEN
    RETURN;
  END IF;

  IF (_end_date - _start_date) > 60 THEN
    RAISE EXCEPTION 'date range too large';
  END IF;

  SELECT e.company_id INTO _caller_company_id
  FROM public.employees e
  WHERE e.auth_user_id = auth.uid() AND e.is_active = true
  LIMIT 1;

  IF _caller_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    emp.id            AS employee_id,
    emp.full_name     AS employee_name,
    emp.department    AS department,
    emp.branch_id     AS branch_id,
    br.name           AS branch_name,
    r.roster_date     AS roster_date,
    r.status          AS status,
    r.shift_template_id AS shift_template_id,
    COALESCE(st.name_ar, NULL) AS shift_name,
    COALESCE(st.color, NULL)   AS shift_color,
    COALESCE(st.start_time, r.start_time) AS start_time,
    COALESCE(st.end_time,   r.end_time)   AS end_time
  FROM public.employees emp
  LEFT JOIN public.daily_roster r
    ON r.employee_id = emp.id
   AND r.roster_date BETWEEN _start_date AND _end_date
  LEFT JOIN public.shift_templates st
    ON st.id = r.shift_template_id
  LEFT JOIN public.branches br
    ON br.id = emp.branch_id
  WHERE emp.company_id = _caller_company_id
    AND emp.is_active = true
    AND emp.show_in_employee_team_schedule = true
  ORDER BY emp.full_name, r.roster_date;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employee_team_schedule(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_employee_team_schedule(date, date) TO authenticated;
