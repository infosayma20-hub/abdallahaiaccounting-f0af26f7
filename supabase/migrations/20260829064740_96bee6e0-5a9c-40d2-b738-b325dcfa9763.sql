-- 1) Recursive manager check with tenant guard (used by daily_roster policies)
CREATE OR REPLACE FUNCTION public.is_manager_of_employee(_target_employee_id uuid, _perm text DEFAULT 'view'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE target AS (
    SELECT e.id, e.manager_employee_id, e.user_id, 1 AS depth
    FROM public.employees e
    WHERE e.id = _target_employee_id
    UNION ALL
    SELECT m.id, m.manager_employee_id, m.user_id, t.depth + 1
    FROM target t
    JOIN public.employees m ON m.id = t.manager_employee_id AND m.user_id = t.user_id
    WHERE t.depth < 8
  )
  SELECT EXISTS (
    SELECT 1
    FROM target t
    JOIN public.employees mgr
      ON mgr.id = t.manager_employee_id
     AND mgr.user_id = t.user_id
    WHERE mgr.auth_user_id = auth.uid()
      AND CASE _perm
        WHEN 'view'       THEN mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance
        WHEN 'schedule'   THEN mgr.can_manage_schedule
        WHEN 'attendance' THEN mgr.can_manage_attendance
        ELSE false
      END
  );
$function$;

-- 2) Tenant guard on the recursive team-visibility check
CREATE OR REPLACE FUNCTION public.is_my_team_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE chain AS (
    SELECT e.id, e.manager_employee_id, e.user_id, 1 AS depth
    FROM public.employees e
    WHERE e.id = _employee_id
    UNION ALL
    SELECT m.id, m.manager_employee_id, m.user_id, c.depth + 1
    FROM chain c
    JOIN public.employees m ON m.id = c.manager_employee_id AND m.user_id = c.user_id
    WHERE c.depth < 8
  )
  SELECT EXISTS (
    SELECT 1
    FROM chain c
    JOIN public.employees mgr
      ON mgr.id = c.manager_employee_id
     AND mgr.user_id = c.user_id
    WHERE mgr.auth_user_id = auth.uid()
      AND (mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance OR mgr.is_manager)
  );
$function$;

-- 3) Team schedule RPC: full reporting tree instead of direct reports only
CREATE OR REPLACE FUNCTION public.get_employee_team_schedule(_start_date date, _end_date date)
RETURNS TABLE(employee_id uuid, employee_name text, department text, branch_id uuid, branch_name text, roster_date date, status text, shift_template_id uuid, shift_name text, shift_color text, start_time time without time zone, end_time time without time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_company_id uuid;
  _caller_emp_id uuid;
  _caller_owner uuid;
  _has_reports boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _start_date IS NULL OR _end_date IS NULL OR _end_date < _start_date THEN RETURN; END IF;
  IF (_end_date - _start_date) > 60 THEN RAISE EXCEPTION 'date range too large'; END IF;

  SELECT e.id, e.company_id, e.user_id
    INTO _caller_emp_id, _caller_company_id, _caller_owner
  FROM public.employees e
  WHERE e.auth_user_id = auth.uid() AND e.is_active = true
  LIMIT 1;

  IF _caller_company_id IS NULL THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _team_tree(id uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _team_tree;

  INSERT INTO _team_tree(id)
  WITH RECURSIVE tree AS (
    SELECT e.id, 1 AS depth
    FROM public.employees e
    WHERE e.manager_employee_id = _caller_emp_id
      AND e.is_active = true
      AND e.user_id = _caller_owner
    UNION ALL
    SELECT c.id, t.depth + 1
    FROM tree t
    JOIN public.employees c
      ON c.manager_employee_id = t.id
     AND c.is_active = true
     AND c.user_id = _caller_owner
    WHERE t.depth < 8
  )
  SELECT DISTINCT id FROM tree;

  SELECT EXISTS (SELECT 1 FROM _team_tree) INTO _has_reports;

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
        THEN (emp.id = _caller_emp_id OR emp.id IN (SELECT id FROM _team_tree))
        ELSE emp.show_in_employee_team_schedule = true
      END
    )
  ORDER BY emp.full_name, r.roster_date;
END;
$function$;

-- 4) Team-id helper: tenant scoped + excludes self-loops
CREATE OR REPLACE FUNCTION public.get_my_team_employee_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE me AS (
    SELECT e.id, e.user_id FROM public.employees e WHERE e.auth_user_id = auth.uid()
  ),
  tree AS (
    SELECT e.id, e.user_id, 1 AS depth
    FROM public.employees e
    JOIN me ON e.manager_employee_id = me.id AND e.user_id = me.user_id
    WHERE e.is_active AND e.id <> me.id
    UNION ALL
    SELECT c.id, c.user_id, t.depth + 1
    FROM tree t
    JOIN public.employees c
      ON c.manager_employee_id = t.id
     AND c.user_id = t.user_id
     AND c.is_active
    WHERE t.depth < 8
      AND c.id <> t.id
  )
  SELECT DISTINCT id FROM tree;
$function$;