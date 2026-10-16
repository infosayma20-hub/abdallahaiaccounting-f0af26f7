CREATE OR REPLACE FUNCTION public.my_own_employee_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(e.id), '{}'::uuid[]) FROM public.employees e WHERE e.auth_user_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.my_branch_mgr_all_employee_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT e.id), '{}'::uuid[]) FROM public.employees e
  JOIN public.branch_manager_assignments bma ON bma.branch_id = e.branch_id AND bma.user_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.me_can_view_hr_complaints()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.hr_manager_permissions p WHERE p.hr_auth_id = auth.uid() AND COALESCE(p.is_active, true) = true AND p.can_view_complaints = true)
$$;
CREATE OR REPLACE FUNCTION public.me_can_view_exec_complaints()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.hr_manager_permissions p WHERE p.hr_auth_id = auth.uid() AND COALESCE(p.is_active, true) = true AND p.can_view_executive_complaints = true)
$$;
CREATE OR REPLACE FUNCTION public.my_builtin_form_view_keys()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT bfa.user_id::text || '|' || bfa.form_key), '{}'::text[])
  FROM public.builtin_form_assignments bfa JOIN public.employees e ON e.id = bfa.employee_id
  WHERE bfa.is_active = true AND bfa.access_level = 'view' AND (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.my_template_view_all_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT fta.template_id), '{}'::uuid[])
  FROM public.form_template_assignments fta JOIN public.employees viewer ON viewer.id = fta.employee_id
  WHERE fta.is_active = true AND fta.source_employee_id IS NULL AND (viewer.auth_user_id = auth.uid() OR viewer.user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.my_template_view_pair_keys()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT fta.template_id::text || '|' || fta.source_employee_id::text), '{}'::text[])
  FROM public.form_template_assignments fta JOIN public.employees viewer ON viewer.id = fta.employee_id
  WHERE fta.is_active = true AND fta.source_employee_id IS NOT NULL AND (viewer.auth_user_id = auth.uid() OR viewer.user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.my_own_employee_ids(), public.my_branch_mgr_all_employee_ids(), public.me_can_view_hr_complaints(), public.me_can_view_exec_complaints(), public.my_builtin_form_view_keys(), public.my_template_view_all_ids(), public.my_template_view_pair_keys() TO authenticated, service_role;

DROP POLICY IF EXISTS "Employees can view own forms" ON public.employee_forms;
CREATE POLICY "Employees can view own forms" ON public.employee_forms FOR SELECT TO public USING (
    employee_id = ANY ((SELECT public.my_own_employee_ids())::uuid[])
    OR ((user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()))
      AND (COALESCE(form_type,'') <> 'complaints' OR CASE WHEN COALESCE(complaint_target,'executive') = 'hr' THEN (SELECT public.me_can_view_hr_complaints()) ELSE (SELECT public.me_can_view_exec_complaints()) END)));
DROP POLICY IF EXISTS "HR managers can view all company forms" ON public.employee_forms;
CREATE POLICY "HR managers can view all company forms" ON public.employee_forms FOR SELECT TO public USING (
    (SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
    AND (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()))
    AND (COALESCE(form_type,'') <> 'complaints' OR CASE WHEN COALESCE(complaint_target,'executive') = 'hr' THEN (SELECT public.me_can_view_hr_complaints()) ELSE (SELECT public.me_can_view_exec_complaints()) END));
DROP POLICY IF EXISTS "Branch managers can view forms in their branches" ON public.employee_forms;
CREATE POLICY "Branch managers can view forms in their branches" ON public.employee_forms FOR SELECT TO public USING (
    employee_id = ANY ((SELECT public.my_branch_mgr_all_employee_ids())::uuid[])
    AND (COALESCE(form_type,'') <> 'complaints' OR CASE WHEN COALESCE(complaint_target,'executive') = 'hr' THEN (SELECT public.me_can_view_hr_complaints()) ELSE (SELECT public.me_can_view_exec_complaints()) END));
DROP POLICY IF EXISTS "Assigned viewers can read builtin submissions" ON public.employee_forms;
CREATE POLICY "Assigned viewers can read builtin submissions" ON public.employee_forms FOR SELECT TO public USING (
    template_id IS NULL
    AND (user_id::text || '|' || form_type) = ANY ((SELECT public.my_builtin_form_view_keys())::text[])
    AND (COALESCE(form_type,'') <> 'complaints' OR CASE WHEN COALESCE(complaint_target,'executive') = 'hr' THEN (SELECT public.me_can_view_hr_complaints()) ELSE (SELECT public.me_can_view_exec_complaints()) END));
DROP POLICY IF EXISTS "Assigned viewers can read template submissions" ON public.employee_forms;
CREATE POLICY "Assigned viewers can read template submissions" ON public.employee_forms FOR SELECT TO authenticated USING (
    template_id IS NOT NULL
    AND (template_id = ANY ((SELECT public.my_template_view_all_ids())::uuid[])
      OR (template_id::text || '|' || employee_id::text) = ANY ((SELECT public.my_template_view_pair_keys())::text[]))
    AND (COALESCE(form_type,'') <> 'complaints' OR CASE WHEN COALESCE(complaint_target,'executive') = 'hr' THEN (SELECT public.me_can_view_hr_complaints()) ELSE (SELECT public.me_can_view_exec_complaints()) END));