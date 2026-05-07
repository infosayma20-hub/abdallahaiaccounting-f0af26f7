
-- Fix infinite recursion: replace direct EXISTS on employees with a security definer function
DROP POLICY IF EXISTS "manager_view_team_employees" ON public.employees;

CREATE OR REPLACE FUNCTION public.is_my_team_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees emp
    JOIN public.employees mgr ON mgr.id = emp.manager_employee_id
    WHERE emp.id = _employee_id
      AND mgr.auth_user_id = auth.uid()
      AND (mgr.can_view_team OR mgr.can_manage_schedule OR mgr.can_manage_attendance)
  );
$$;

CREATE POLICY "manager_view_team_employees"
ON public.employees
FOR SELECT
TO authenticated
USING (public.is_my_team_employee(id));
