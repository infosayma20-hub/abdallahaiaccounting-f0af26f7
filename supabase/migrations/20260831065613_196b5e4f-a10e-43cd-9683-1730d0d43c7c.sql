-- ============================================================
-- Multi-manager teams: employee can report to more than one manager.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_manager_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  manager_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (manager_employee_id, employee_id),
  CHECK (manager_employee_id <> employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_manager_links TO authenticated;
GRANT ALL ON public.employee_manager_links TO service_role;

ALTER TABLE public.employee_manager_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_eml_manager ON public.employee_manager_links(manager_employee_id);
CREATE INDEX IF NOT EXISTS idx_eml_employee ON public.employee_manager_links(employee_id);
CREATE INDEX IF NOT EXISTS idx_eml_owner ON public.employee_manager_links(user_id);

DROP POLICY IF EXISTS "eml tenant read" ON public.employee_manager_links;
CREATE POLICY "eml tenant read" ON public.employee_manager_links
  FOR SELECT TO authenticated
  USING (user_id = public.get_team_owner_id());

DROP POLICY IF EXISTS "eml tenant write" ON public.employee_manager_links;
CREATE POLICY "eml tenant write" ON public.employee_manager_links
  FOR ALL TO authenticated
  USING (user_id = public.get_team_owner_id())
  WITH CHECK (user_id = public.get_team_owner_id());

INSERT INTO public.employee_manager_links (user_id, manager_employee_id, employee_id)
SELECT e.user_id, e.manager_employee_id, e.id
FROM public.employees e
WHERE e.manager_employee_id IS NOT NULL
  AND e.manager_employee_id <> e.id
ON CONFLICT (manager_employee_id, employee_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_primary_manager_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.manager_employee_id IS NOT NULL AND NEW.manager_employee_id <> NEW.id THEN
    INSERT INTO public.employee_manager_links (user_id, manager_employee_id, employee_id)
    VALUES (NEW.user_id, NEW.manager_employee_id, NEW.id)
    ON CONFLICT (manager_employee_id, employee_id) DO NOTHING;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.manager_employee_id IS NOT NULL
     AND NEW.manager_employee_id IS DISTINCT FROM OLD.manager_employee_id THEN
    DELETE FROM public.employee_manager_links
    WHERE employee_id = NEW.id AND manager_employee_id = OLD.manager_employee_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_manager_link ON public.employees;
CREATE TRIGGER trg_sync_primary_manager_link
AFTER INSERT OR UPDATE OF manager_employee_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_primary_manager_link();

CREATE OR REPLACE FUNCTION public.get_reporting_edges()
RETURNS TABLE(emp_id uuid, mgr_id uuid, owner_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.manager_employee_id, e.user_id
  FROM public.employees e
  WHERE e.manager_employee_id IS NOT NULL
    AND e.is_active
    AND e.manager_employee_id <> e.id
  UNION
  SELECT l.employee_id, l.manager_employee_id, l.user_id
  FROM public.employee_manager_links l
  JOIN public.employees e ON e.id = l.employee_id AND e.is_active;
$$;

GRANT EXECUTE ON FUNCTION public.get_reporting_edges() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_team_employee_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE me AS (
    SELECT e.id, e.user_id FROM public.employees e WHERE e.auth_user_id = auth.uid()
  ),
  edges AS (SELECT * FROM public.get_reporting_edges()),
  tree AS (
    SELECT ed.emp_id AS id, ed.owner_id, 1 AS depth
    FROM edges ed
    JOIN me ON ed.mgr_id = me.id AND ed.owner_id = me.user_id
    UNION ALL
    SELECT ed.emp_id, ed.owner_id, t.depth + 1
    FROM tree t
    JOIN edges ed ON ed.mgr_id = t.id AND ed.owner_id = t.owner_id
    WHERE t.depth < 8 AND ed.emp_id <> t.id
  )
  SELECT DISTINCT id FROM tree;
$$;

CREATE OR REPLACE FUNCTION public.is_my_team_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE edges AS (SELECT * FROM public.get_reporting_edges()),
  chain AS (
    SELECT ed.mgr_id, ed.owner_id, 1 AS depth
    FROM edges ed WHERE ed.emp_id = _employee_id
    UNION ALL
    SELECT ed.mgr_id, ed.owner_id, c.depth + 1
    FROM chain c
    JOIN edges ed ON ed.emp_id = c.mgr_id AND ed.owner_id = c.owner_id
    WHERE c.depth < 8
  )
  SELECT EXISTS (
    SELECT 1 FROM chain c
    JOIN public.employees mgr ON mgr.id = c.mgr_id AND mgr.user_id = c.owner_id
    WHERE mgr.auth_user_id = auth.uid()
      AND (mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance OR mgr.is_manager)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_of_employee(_target_employee_id uuid, _perm text DEFAULT 'view'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH RECURSIVE edges AS (SELECT * FROM public.get_reporting_edges()),
  chain AS (
    SELECT ed.mgr_id, ed.owner_id, 1 AS depth
    FROM edges ed WHERE ed.emp_id = _target_employee_id
    UNION ALL
    SELECT ed.mgr_id, ed.owner_id, c.depth + 1
    FROM chain c
    JOIN edges ed ON ed.emp_id = c.mgr_id AND ed.owner_id = c.owner_id
    WHERE c.depth < 8
  )
  SELECT EXISTS (
    SELECT 1 FROM chain c
    JOIN public.employees mgr ON mgr.id = c.mgr_id AND mgr.user_id = c.owner_id
    WHERE mgr.auth_user_id = auth.uid()
      AND CASE _perm
        WHEN 'view'       THEN mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance
        WHEN 'schedule'   THEN mgr.can_manage_schedule
        WHEN 'attendance' THEN mgr.can_manage_attendance
        ELSE false
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.get_employee_team_schedule(_start_date date, _end_date date)
RETURNS TABLE(employee_id uuid, employee_name text, department text, branch_id uuid, branch_name text, roster_date date, status text, shift_template_id uuid, shift_name text, shift_color text, start_time time without time zone, end_time time without time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  WITH RECURSIVE edges AS (SELECT * FROM public.get_reporting_edges()),
  tree AS (
    SELECT ed.emp_id AS id, 1 AS depth
    FROM edges ed
    WHERE ed.mgr_id = _caller_emp_id AND ed.owner_id = _caller_owner
    UNION ALL
    SELECT ed.emp_id, t.depth + 1
    FROM tree t
    JOIN edges ed ON ed.mgr_id = t.id AND ed.owner_id = _caller_owner
    WHERE t.depth < 8 AND ed.emp_id <> t.id
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
$$;