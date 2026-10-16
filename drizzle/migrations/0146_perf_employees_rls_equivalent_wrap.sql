CREATE OR REPLACE FUNCTION public.my_chain_employee_ids()
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  WITH RECURSIVE edges AS (SELECT * FROM public.get_reporting_edges()),
  me AS (
    SELECT e.id, e.user_id FROM public.employees e
    WHERE e.auth_user_id = auth.uid()
      AND (e.can_view_team OR e.can_manage_schedule OR e.can_manage_attendance OR e.is_manager)
  ),
  chain AS (
    SELECT ed.emp_id, ed.owner_id, 1 AS depth
    FROM edges ed JOIN me m ON ed.mgr_id = m.id AND ed.owner_id = m.user_id
    UNION ALL
    SELECT ed.emp_id, ed.owner_id, c.depth + 1
    FROM chain c JOIN edges ed ON ed.mgr_id = c.emp_id AND ed.owner_id = c.owner_id
    WHERE c.depth < 8
  )
  SELECT COALESCE(array_agg(DISTINCT emp_id), '{}'::uuid[]) FROM chain
$f$;

CREATE OR REPLACE FUNCTION public.my_managed_branch_employee_ids()
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  SELECT COALESCE(array_agg(DISTINCT emp.id), '{}'::uuid[])
  FROM public.employees emp
  JOIN public.branch_manager_assignments bma ON bma.branch_id = emp.branch_id
  WHERE bma.user_id = auth.uid() AND emp.is_active = true
$f$;

REVOKE EXECUTE ON FUNCTION public.my_chain_employee_ids() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.my_managed_branch_employee_ids() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_chain_employee_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_managed_branch_employee_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS manager_view_team_employees ON public.employees;
CREATE POLICY manager_view_team_employees ON public.employees FOR SELECT TO authenticated
  USING (id = ANY ((SELECT public.my_chain_employee_ids())::uuid[]));

DROP POLICY IF EXISTS branch_manager_view_branch_employees ON public.employees;
CREATE POLICY branch_manager_view_branch_employees ON public.employees FOR SELECT TO authenticated
  USING (id = ANY ((SELECT public.my_managed_branch_employee_ids())::uuid[]));

DROP POLICY IF EXISTS "Team can view employees" ON public.employees;
CREATE POLICY "Team can view employees" ON public.employees FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Team can manage employee movements" ON public.employee_financial_movements;
CREATE POLICY "Team can manage employee movements" ON public.employee_financial_movements FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id((SELECT auth.uid()))))
  WITH CHECK (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id((SELECT auth.uid()))));