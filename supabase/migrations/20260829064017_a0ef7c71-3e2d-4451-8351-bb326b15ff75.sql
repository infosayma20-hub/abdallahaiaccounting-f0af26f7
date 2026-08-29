-- Recursive team visibility: a manager sees his whole reporting tree, not only direct reports.
CREATE OR REPLACE FUNCTION public.is_my_team_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE chain AS (
    SELECT e.id, e.manager_employee_id, 1 AS depth
    FROM public.employees e
    WHERE e.id = _employee_id
    UNION ALL
    SELECT m.id, m.manager_employee_id, c.depth + 1
    FROM chain c
    JOIN public.employees m ON m.id = c.manager_employee_id
    WHERE c.depth < 8
  )
  SELECT EXISTS (
    SELECT 1
    FROM chain c
    JOIN public.employees mgr ON mgr.id = c.manager_employee_id
    WHERE mgr.auth_user_id = auth.uid()
      AND (mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance OR mgr.is_manager)
  );
$$;

-- Returns every employee in the caller's reporting tree (direct + indirect reports).
CREATE OR REPLACE FUNCTION public.get_my_team_employee_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE me AS (
    SELECT e.id FROM public.employees e WHERE e.auth_user_id = auth.uid()
  ),
  tree AS (
    SELECT e.id, 1 AS depth
    FROM public.employees e
    WHERE e.manager_employee_id IN (SELECT id FROM me)
      AND e.is_active
    UNION ALL
    SELECT c.id, t.depth + 1
    FROM tree t
    JOIN public.employees c ON c.manager_employee_id = t.id AND c.is_active
    WHERE t.depth < 8
  )
  SELECT DISTINCT id FROM tree;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_team_employee_ids() TO authenticated;