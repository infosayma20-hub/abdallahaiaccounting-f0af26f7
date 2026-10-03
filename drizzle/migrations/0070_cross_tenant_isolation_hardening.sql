-- Helper: target user belongs to caller's team
CREATE OR REPLACE FUNCTION public.is_same_team(_target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT _target IS NOT NULL AND public.get_team_owner_id(_target) = public.get_team_owner_id(auth.uid())
$$;

-- 1) is_hr_admin: admins only within own tenant (super_admin stays global)
CREATE OR REPLACE FUNCTION public.is_hr_admin(_auth_uid uuid, _data_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    _auth_uid = _data_owner
    OR (public.get_team_owner_id(_auth_uid) = _data_owner
        AND (public.has_role(_auth_uid,'admin'::app_role) OR public.has_role(_auth_uid,'hr_manager'::app_role)))
    OR public.has_role(_auth_uid,'super_admin'::app_role)
$$;

-- 2) historical sales
CREATE OR REPLACE FUNCTION public.can_view_historical_sales(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    COALESCE(current_setting('request.jwt.claim.role', true), current_user) = 'service_role'
    OR current_user = 'service_role'
    OR (public.has_role(auth.uid(),'admin'::app_role) AND public.is_team_member(auth.uid(), _owner))
    OR EXISTS (SELECT 1 FROM public.malaki_portal_users mpu
      WHERE mpu.auth_user_id = auth.uid() AND mpu.user_id = _owner AND mpu.role='owner' AND mpu.is_active = true);
$$;
DROP POLICY IF EXISTS historical_sales_admin_write ON public.historical_sales_daily;
CREATE POLICY historical_sales_admin_write ON public.historical_sales_daily FOR ALL TO authenticated
USING (has_role((SELECT auth.uid()),'admin'::app_role) AND is_team_member((SELECT auth.uid()), user_id))
WITH CHECK (has_role((SELECT auth.uid()),'admin'::app_role) AND is_team_member((SELECT auth.uid()), user_id));

-- 3) perf samples
DROP POLICY IF EXISTS perf_select_own_or_admin ON public.app_perf_samples;
CREATE POLICY perf_select_own_or_admin ON public.app_perf_samples FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id OR has_role((SELECT auth.uid()),'super_admin'::app_role));

-- 4) employee allowed branches
DROP POLICY IF EXISTS "Owner manages employee_allowed_branches" ON public.employee_allowed_branches;
CREATE POLICY "Owner manages employee_allowed_branches" ON public.employee_allowed_branches FOR ALL TO authenticated
USING (user_id = get_team_owner_id((SELECT auth.uid())))
WITH CHECK (user_id = get_team_owner_id((SELECT auth.uid())));

-- 5) payroll
DROP POLICY IF EXISTS "Data owner can view employees payroll" ON public.employee_payroll;
CREATE POLICY "Data owner can view employees payroll" ON public.employee_payroll FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_payroll.employee_id
  AND (e.user_id = (SELECT auth.uid())
       OR (is_team_member((SELECT auth.uid()), e.user_id)
           AND (has_role((SELECT auth.uid()),'hr_manager'::app_role) OR has_role((SELECT auth.uid()),'admin'::app_role))))));

-- 6) form notification subscribers
DROP POLICY IF EXISTS fns_manage_by_owner_or_hr ON public.form_notification_subscribers;
CREATE POLICY fns_manage_by_owner_or_hr ON public.form_notification_subscribers FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id OR (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role))))
WITH CHECK ((SELECT auth.uid()) = user_id OR (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role))));

-- 7) POS shift audits
DROP POLICY IF EXISTS admin_accountant_full_audit ON public.pos_shift_audits;
CREATE POLICY admin_accountant_full_audit ON public.pos_shift_audits FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()) OR (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'accountant_senior'::app_role))))
WITH CHECK (user_id = (SELECT auth.uid()) OR (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'accountant_senior'::app_role))));

-- 8) form referrals / section assignments
DROP POLICY IF EXISTS "Admins and HR manage form referrals" ON public.employee_form_referrals;
CREATE POLICY "Admins and HR manage form referrals" ON public.employee_form_referrals FOR ALL TO authenticated
USING (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)))
WITH CHECK (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)));
DROP POLICY IF EXISTS "Admins and HR manage section assignments" ON public.form_section_assignments;
CREATE POLICY "Admins and HR manage section assignments" ON public.form_section_assignments FOR ALL TO authenticated
USING (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)))
WITH CHECK (is_team_member((SELECT auth.uid()), user_id) AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)));

-- 9) user_roles (prevented cross-tenant read and role escalation)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated
USING (has_role((SELECT auth.uid()),'admin'::app_role) AND is_same_team(user_id));
DROP POLICY IF EXISTS "Admins can insert non-super roles" ON public.user_roles;
CREATE POLICY "Admins can insert non-super roles" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (has_role((SELECT auth.uid()),'admin'::app_role) AND role <> 'super_admin'::app_role AND is_same_team(user_id));
DROP POLICY IF EXISTS "Admins can update non-super roles" ON public.user_roles;
CREATE POLICY "Admins can update non-super roles" ON public.user_roles FOR UPDATE TO authenticated
USING (has_role((SELECT auth.uid()),'admin'::app_role) AND role <> 'super_admin'::app_role AND is_same_team(user_id))
WITH CHECK (has_role((SELECT auth.uid()),'admin'::app_role) AND role <> 'super_admin'::app_role AND is_same_team(user_id));
DROP POLICY IF EXISTS "Admins can delete non-super roles" ON public.user_roles;
CREATE POLICY "Admins can delete non-super roles" ON public.user_roles FOR DELETE TO authenticated
USING (has_role((SELECT auth.uid()),'admin'::app_role) AND role <> 'super_admin'::app_role AND is_same_team(user_id));

-- 10) branch manager assignments / user scope access
DROP POLICY IF EXISTS bma_modify ON public.branch_manager_assignments;
CREATE POLICY bma_modify ON public.branch_manager_assignments FOR ALL TO authenticated
USING ((has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)) AND is_same_team(user_id))
WITH CHECK ((has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)) AND is_same_team(user_id));
DROP POLICY IF EXISTS bma_select ON public.branch_manager_assignments;
CREATE POLICY bma_select ON public.branch_manager_assignments FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR ((has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role)) AND is_same_team(user_id)));
DROP POLICY IF EXISTS "admins manage scope" ON public.user_scope_access;
CREATE POLICY "admins manage scope" ON public.user_scope_access FOR ALL TO authenticated
USING (has_role((SELECT auth.uid()),'super_admin'::app_role) OR (has_role((SELECT auth.uid()),'admin'::app_role) AND is_same_team(user_id)))
WITH CHECK (has_role((SELECT auth.uid()),'super_admin'::app_role) OR (has_role((SELECT auth.uid()),'admin'::app_role) AND is_same_team(user_id)));
DROP POLICY IF EXISTS "users read own scope" ON public.user_scope_access;
CREATE POLICY "users read own scope" ON public.user_scope_access FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR has_role((SELECT auth.uid()),'super_admin'::app_role) OR (has_role((SELECT auth.uid()),'admin'::app_role) AND is_same_team(user_id)));

-- 11) shift templates (company scoped)
DROP POLICY IF EXISTS shift_templates_modify ON public.shift_templates;
CREATE POLICY shift_templates_modify ON public.shift_templates FOR ALL TO authenticated
USING ((has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role))
  AND EXISTS (SELECT 1 FROM companies c WHERE c.id = shift_templates.company_id AND is_team_member((SELECT auth.uid()), c.owner_id)))
WITH CHECK ((has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role))
  AND EXISTS (SELECT 1 FROM companies c WHERE c.id = shift_templates.company_id AND is_team_member((SELECT auth.uid()), c.owner_id)));

-- 12) platform-level tables: super admin only
DROP POLICY IF EXISTS "Admins can view all tickets" ON public.support_tickets;
CREATE POLICY "Admins can view all tickets" ON public.support_tickets FOR SELECT TO authenticated USING (has_role((SELECT auth.uid()),'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can update any ticket" ON public.support_tickets;
CREATE POLICY "Admins can update any ticket" ON public.support_tickets FOR UPDATE TO authenticated USING (has_role((SELECT auth.uid()),'super_admin'::app_role));
DROP POLICY IF EXISTS finance_fix_log_admin_read ON public.finance_integrity_fix_log;
CREATE POLICY finance_fix_log_admin_read ON public.finance_integrity_fix_log FOR SELECT TO authenticated USING (has_role((SELECT auth.uid()),'super_admin'::app_role));
DROP POLICY IF EXISTS admin_read_integrity_issues ON public.identity_integrity_issues;
CREATE POLICY admin_read_integrity_issues ON public.identity_integrity_issues FOR SELECT TO authenticated USING (has_role((SELECT auth.uid()),'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage permissions" ON public.role_permissions FOR ALL TO authenticated
USING (has_role((SELECT auth.uid()),'super_admin'::app_role)) WITH CHECK (has_role((SELECT auth.uid()),'super_admin'::app_role));
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.sensitive_data_audit;

-- 13) employee form approvals (company scoped)
DROP POLICY IF EXISTS "HR managers manage form approvals" ON public.employee_form_approvals;
CREATE POLICY "HR managers manage form approvals" ON public.employee_form_approvals FOR UPDATE TO authenticated
USING ((has_role((SELECT auth.uid()),'hr_manager'::app_role) OR has_role((SELECT auth.uid()),'admin'::app_role))
  AND EXISTS (SELECT 1 FROM companies c WHERE c.id = employee_form_approvals.company_id AND is_team_member((SELECT auth.uid()), c.owner_id)));

-- 14) notification templates (company scoped)
DROP POLICY IF EXISTS view_system_or_company_templates ON public.notification_templates;
CREATE POLICY view_system_or_company_templates ON public.notification_templates FOR SELECT TO authenticated
USING (is_system = true OR (company_id IS NOT NULL
  AND (has_role((SELECT auth.uid()),'admin'::app_role) OR has_role((SELECT auth.uid()),'hr_manager'::app_role) OR has_role((SELECT auth.uid()),'accountant_senior'::app_role) OR has_role((SELECT auth.uid()),'super_admin'::app_role))
  AND EXISTS (SELECT 1 FROM companies c WHERE c.id = notification_templates.company_id AND is_team_member((SELECT auth.uid()), c.owner_id))));