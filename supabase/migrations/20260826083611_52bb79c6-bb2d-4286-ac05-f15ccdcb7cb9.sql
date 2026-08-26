-- 1) Managers flagged only with is_manager should also count as team viewers
CREATE OR REPLACE FUNCTION public.is_my_team_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees emp
    JOIN public.employees mgr ON mgr.id = emp.manager_employee_id
    WHERE emp.id = _employee_id
      AND mgr.auth_user_id = auth.uid()
      AND (mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance OR mgr.is_manager)
  );
$function$;

-- 2) Direct-report managers can read their team's attendance
DROP POLICY IF EXISTS "Managers can view team attendance days" ON public.attendance_days;
CREATE POLICY "Managers can view team attendance days"
ON public.attendance_days FOR SELECT TO authenticated
USING (public.is_my_team_employee(employee_id));

DROP POLICY IF EXISTS "Managers can view team attendance events" ON public.attendance_events;
CREATE POLICY "Managers can view team attendance events"
ON public.attendance_events FOR SELECT TO authenticated
USING (public.is_my_team_employee(employee_id));

DROP POLICY IF EXISTS "Managers can view team attendance breaks" ON public.attendance_breaks;
CREATE POLICY "Managers can view team attendance breaks"
ON public.attendance_breaks FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.attendance_days d
  WHERE d.id = attendance_breaks.attendance_day_id
    AND public.is_my_team_employee(d.employee_id)
));

-- 3) Team schedule RPC: scope to direct reports when the caller manages people
CREATE OR REPLACE FUNCTION public.get_employee_team_schedule(_start_date date, _end_date date)
RETURNS TABLE(employee_id uuid, employee_name text, department text, branch_id uuid, branch_name text, roster_date date, status text, shift_template_id uuid, shift_name text, shift_color text, start_time time without time zone, end_time time without time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_company_id uuid;
  _caller_emp_id uuid;
  _has_reports boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date THEN RETURN; END IF;
  IF (_end_date - _start_date) > 60 THEN RAISE EXCEPTION 'date range too large'; END IF;

  SELECT e.id, e.company_id INTO _caller_emp_id, _caller_company_id
  FROM public.employees e
  WHERE e.auth_user_id = auth.uid() AND e.is_active = true
  LIMIT 1;

  IF _caller_company_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employees t
    WHERE t.manager_employee_id = _caller_emp_id AND t.is_active = true
  ) INTO _has_reports;

  RETURN QUERY
  SELECT
    emp.id, emp.full_name, emp.department, emp.branch_id, br.name,
    r.roster_date, r.status, r.shift_template_id,
    st.name_ar, st.color,
    COALESCE(st.start_time, r.start_time),
    COALESCE(st.end_time, r.end_time)
  FROM public.employees emp
  LEFT JOIN public.daily_roster r
    ON r.employee_id = emp.id
   AND r.roster_date BETWEEN _start_date AND _end_date
  LEFT JOIN public.shift_templates st ON st.id = r.shift_template_id
  LEFT JOIN public.branches br ON br.id = emp.branch_id
  WHERE emp.company_id = _caller_company_id
    AND emp.is_active = true
    AND (
      CASE WHEN _has_reports
        THEN (emp.manager_employee_id = _caller_emp_id OR emp.id = _caller_emp_id)
        ELSE emp.show_in_employee_team_schedule = true
      END
    )
  ORDER BY emp.full_name, r.roster_date;
END;
$function$;