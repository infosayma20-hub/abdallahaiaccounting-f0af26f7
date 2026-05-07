
-- ============================================================
-- Generic Workforce Management: manager + per-employee permissions
-- ============================================================

-- 1) Add columns to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS manager_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS can_view_team boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_attendance boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_employees_manager_employee_id
  ON public.employees(manager_employee_id);

-- 2) Helper: is current auth.uid() a manager (with given permission) of target employee?
CREATE OR REPLACE FUNCTION public.is_manager_of_employee(_target_employee_id uuid, _perm text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees mgr
    JOIN public.employees emp
      ON emp.manager_employee_id = mgr.id
     AND emp.user_id = mgr.user_id  -- same tenant/owner
    WHERE mgr.auth_user_id = auth.uid()
      AND emp.id = _target_employee_id
      AND CASE _perm
        WHEN 'view'       THEN mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance
        WHEN 'schedule'   THEN mgr.can_manage_schedule
        WHEN 'attendance' THEN mgr.can_manage_attendance
        ELSE false
      END
  );
$$;

-- 3) Update RLS on daily_roster to allow direct managers
DROP POLICY IF EXISTS "manager_select_team_roster" ON public.daily_roster;
DROP POLICY IF EXISTS "manager_modify_team_roster" ON public.daily_roster;

CREATE POLICY "manager_select_team_roster"
ON public.daily_roster
FOR SELECT
TO authenticated
USING (public.is_manager_of_employee(employee_id, 'view'));

CREATE POLICY "manager_modify_team_roster"
ON public.daily_roster
FOR ALL
TO authenticated
USING (public.is_manager_of_employee(employee_id, 'schedule'))
WITH CHECK (public.is_manager_of_employee(employee_id, 'schedule'));

-- 4) Allow managers to read shift templates of their company
DROP POLICY IF EXISTS "manager_view_shift_templates" ON public.shift_templates;
CREATE POLICY "manager_view_shift_templates"
ON public.shift_templates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees mgr
    WHERE mgr.auth_user_id = auth.uid()
      AND mgr.company_id = public.shift_templates.company_id
      AND (mgr.can_view_team OR mgr.can_manage_schedule)
  )
);

-- 5) Allow managers to read their team employees (basic info for roster UI)
DROP POLICY IF EXISTS "manager_view_team_employees" ON public.employees;
CREATE POLICY "manager_view_team_employees"
ON public.employees
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees mgr
    WHERE mgr.auth_user_id = auth.uid()
      AND mgr.id = public.employees.manager_employee_id
      AND (mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance)
  )
);
