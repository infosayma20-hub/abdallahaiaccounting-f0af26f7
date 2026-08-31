
CREATE OR REPLACE FUNCTION public.my_org_employee_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[])
  FROM public.employees e
  WHERE e.user_id = auth.uid()
     OR e.user_id = public.get_team_owner_id(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.my_visible_employee_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ),
  branch_emps AS (
    SELECT e.id FROM public.employees e
    JOIN public.branch_manager_assignments bma
      ON bma.branch_id = e.branch_id AND bma.user_id = auth.uid()
    WHERE e.branch_id IS NOT NULL
  )
  SELECT COALESCE(array_agg(DISTINCT s.id), '{}'::uuid[])
  FROM (SELECT emp_id AS id FROM chain UNION SELECT id FROM branch_emps) s
$$;

GRANT EXECUTE ON FUNCTION public.my_org_employee_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_visible_employee_ids() TO authenticated;

DROP POLICY IF EXISTS "Team can view contacts" ON public.contacts;
CREATE POLICY "Team can view contacts" ON public.contacts FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()));

DROP POLICY IF EXISTS "Sales rep can view owner contacts" ON public.contacts;
CREATE POLICY "Sales rep can view owner contacts" ON public.contacts FOR SELECT TO authenticated
USING ((SELECT public.is_sales_rep()) AND user_id = (SELECT public.get_rep_owner_id()));

DROP POLICY IF EXISTS "Team can view products" ON public.products;
CREATE POLICY "Team can view products" ON public.products FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()));

DROP POLICY IF EXISTS "Sales rep can view owner products" ON public.products;
CREATE POLICY "Sales rep can view owner products" ON public.products FOR SELECT TO authenticated
USING ((SELECT public.is_sales_rep()) AND user_id = (SELECT public.get_rep_owner_id()));

DROP POLICY IF EXISTS "Anon can view kiosk products" ON public.products;
CREATE POLICY "Anon can view kiosk products" ON public.products FOR SELECT TO anon
USING (COALESCE(is_pos_available, false) = true AND EXISTS (
  SELECT 1 FROM public.kiosk_settings ks WHERE ks.user_id = products.user_id AND ks.is_active = true));

DROP POLICY IF EXISTS "Team can view transactions" ON public.transactions;
CREATE POLICY "Team can view transactions" ON public.transactions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()));

DROP POLICY IF EXISTS "Team can manage POS orders" ON public.pos_orders;
CREATE POLICY "Team can manage POS orders" ON public.pos_orders FOR ALL TO authenticated
USING ((user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()))
  AND (SELECT public.user_can_access((SELECT auth.uid()), 'pos')))
WITH CHECK ((user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()))
  AND (SELECT public.user_can_access((SELECT auth.uid()), 'pos')));

DROP POLICY IF EXISTS "Team can manage POS order lines" ON public.pos_order_lines;
CREATE POLICY "Team can manage POS order lines" ON public.pos_order_lines FOR ALL TO authenticated
USING ((user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()))
  AND (SELECT public.user_can_access((SELECT auth.uid()), 'pos')))
WITH CHECK ((user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()))
  AND (SELECT public.user_can_access((SELECT auth.uid()), 'pos')));

DROP POLICY IF EXISTS "Users can view own invoice items" ON public.invoice_items;
CREATE POLICY "Users can view own invoice items" ON public.invoice_items FOR SELECT TO authenticated
USING (invoice_id IN (
  SELECT i.id FROM public.invoices i
  WHERE i.user_id = (SELECT auth.uid()) OR i.user_id = (SELECT public.get_team_owner_id())));

DROP POLICY IF EXISTS "Managers can view team attendance days" ON public.attendance_days;
DROP POLICY IF EXISTS "Branch managers can view team attendance days" ON public.attendance_days;
CREATE POLICY "Managers can view team attendance days" ON public.attendance_days FOR SELECT TO authenticated
USING (employee_id = ANY ((SELECT public.my_visible_employee_ids())::uuid[]));

DROP POLICY IF EXISTS "HR can view organization attendance days" ON public.attendance_days;
CREATE POLICY "HR can view organization attendance days" ON public.attendance_days FOR SELECT TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);

DROP POLICY IF EXISTS "HR can update organization attendance days" ON public.attendance_days;
CREATE POLICY "HR can update organization attendance days" ON public.attendance_days FOR UPDATE TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);
