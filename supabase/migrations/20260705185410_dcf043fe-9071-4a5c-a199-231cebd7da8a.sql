
-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_attendance_days_auth_user_date
  ON public.attendance_days (auth_user_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_days_emp_date
  ON public.attendance_days (employee_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_correction_requests_auth_user_date
  ON public.correction_requests (auth_user_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_correction_requests_employee
  ON public.correction_requests (employee_id);

CREATE INDEX IF NOT EXISTS idx_employees_user_id
  ON public.employees (user_id);

CREATE INDEX IF NOT EXISTS idx_work_shifts_user
  ON public.work_shifts (user_id);

CREATE INDEX IF NOT EXISTS idx_official_holidays_user
  ON public.official_holidays (user_id);

CREATE INDEX IF NOT EXISTS idx_branches_user
  ON public.branches (user_id);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_user
  ON public.employee_leaves (user_id);

CREATE INDEX IF NOT EXISTS idx_employee_leaves_emp_dates
  ON public.employee_leaves (employee_id, start_date, end_date);

-- ---------- RLS: attendance_days ----------
DROP POLICY IF EXISTS "Employees can view own days" ON public.attendance_days;
CREATE POLICY "Employees can view own days" ON public.attendance_days
  FOR SELECT USING ((select auth.uid()) = auth_user_id);

DROP POLICY IF EXISTS "employee_own_attendance_days" ON public.attendance_days;
CREATE POLICY "employee_own_attendance_days" ON public.attendance_days
  FOR SELECT USING (auth_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "System can insert days" ON public.attendance_days;
CREATE POLICY "System can insert days" ON public.attendance_days
  FOR INSERT WITH CHECK ((select auth.uid()) = auth_user_id);

DROP POLICY IF EXISTS "System can update own days" ON public.attendance_days;
CREATE POLICY "System can update own days" ON public.attendance_days
  FOR UPDATE USING ((select auth.uid()) = auth_user_id);

DROP POLICY IF EXISTS "HR can view organization attendance days" ON public.attendance_days;
CREATE POLICY "HR can view organization attendance days" ON public.attendance_days
  FOR SELECT USING (
    (has_role((select auth.uid()), 'hr_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = attendance_days.employee_id
        AND is_team_member((select auth.uid()), e.user_id)
    )
  );

DROP POLICY IF EXISTS "HR can update organization attendance days" ON public.attendance_days;
CREATE POLICY "HR can update organization attendance days" ON public.attendance_days
  FOR UPDATE USING (
    (has_role((select auth.uid()), 'hr_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = attendance_days.employee_id
        AND is_team_member((select auth.uid()), e.user_id)
    )
  );

DROP POLICY IF EXISTS "Branch managers can view team attendance days" ON public.attendance_days;
CREATE POLICY "Branch managers can view team attendance days" ON public.attendance_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = attendance_days.employee_id
        AND e.branch_id IS NOT NULL
        AND is_branch_manager_of((select auth.uid()), e.branch_id)
    )
  );

-- ---------- RLS: correction_requests ----------
DROP POLICY IF EXISTS "Employees can view own requests" ON public.correction_requests;
CREATE POLICY "Employees can view own requests" ON public.correction_requests
  FOR SELECT USING ((select auth.uid()) = auth_user_id);

DROP POLICY IF EXISTS "Employees can create requests" ON public.correction_requests;
CREATE POLICY "Employees can create requests" ON public.correction_requests
  FOR INSERT WITH CHECK ((select auth.uid()) = auth_user_id);

DROP POLICY IF EXISTS "HR can update organization corrections" ON public.correction_requests;
CREATE POLICY "HR can update organization corrections" ON public.correction_requests
  FOR UPDATE USING (
    (has_role((select auth.uid()), 'hr_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = correction_requests.employee_id
        AND is_team_member((select auth.uid()), e.user_id)
    )
  );

DROP POLICY IF EXISTS "HR can send messages to team employees" ON public.correction_requests;
CREATE POLICY "HR can send messages to team employees" ON public.correction_requests
  FOR INSERT WITH CHECK (
    (has_role((select auth.uid()), 'hr_manager'::app_role) OR has_role((select auth.uid()), 'admin'::app_role))
    AND (request_type = ANY (ARRAY['hr_message'::text, 'penalty'::text]))
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = correction_requests.employee_id
        AND is_team_member((select auth.uid()), e.user_id)
        AND e.user_id = correction_requests.auth_user_id
    )
  );

DROP POLICY IF EXISTS "Branch managers can view team correction requests" ON public.correction_requests;
CREATE POLICY "Branch managers can view team correction requests" ON public.correction_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = correction_requests.employee_id
        AND e.branch_id IS NOT NULL
        AND is_branch_manager_of((select auth.uid()), e.branch_id)
    )
  );

DROP POLICY IF EXISTS "Branch managers can update team correction requests" ON public.correction_requests;
CREATE POLICY "Branch managers can update team correction requests" ON public.correction_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = correction_requests.employee_id
        AND e.branch_id IS NOT NULL
        AND is_branch_manager_of((select auth.uid()), e.branch_id)
    )
  );

-- ---------- RLS: employees ----------
DROP POLICY IF EXISTS "Team can view employees" ON public.employees;
CREATE POLICY "Team can view employees" ON public.employees
  FOR SELECT USING (is_team_member((select auth.uid()), user_id));

DROP POLICY IF EXISTS "Team can manage employees" ON public.employees;
CREATE POLICY "Team can manage employees" ON public.employees
  FOR INSERT WITH CHECK (
    is_team_member((select auth.uid()), user_id)
    AND user_can_access((select auth.uid()), 'hr'::text)
  );

DROP POLICY IF EXISTS "Team can update employees" ON public.employees;
CREATE POLICY "Team can update employees" ON public.employees
  FOR UPDATE USING (
    is_team_member((select auth.uid()), user_id)
    AND user_can_access((select auth.uid()), 'hr'::text)
  );

DROP POLICY IF EXISTS "Team can delete employees" ON public.employees;
CREATE POLICY "Team can delete employees" ON public.employees
  FOR DELETE USING (
    is_team_member((select auth.uid()), user_id)
    AND (
      has_role((select auth.uid()), 'admin'::app_role)
      OR has_role((select auth.uid()), 'super_admin'::app_role)
      OR has_role((select auth.uid()), 'hr_manager'::app_role)
    )
  );

DROP POLICY IF EXISTS "Users can insert their own employees" ON public.employees;
CREATE POLICY "Users can insert their own employees" ON public.employees
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "employees_read_own_record" ON public.employees;
CREATE POLICY "employees_read_own_record" ON public.employees
  FOR SELECT USING (auth_user_id = (select auth.uid()));

-- ---------- RLS: employee_leaves ----------
DROP POLICY IF EXISTS "Users can view their own leaves" ON public.employee_leaves;
CREATE POLICY "Users can view their own leaves" ON public.employee_leaves
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own leaves" ON public.employee_leaves;
CREATE POLICY "Users can insert their own leaves" ON public.employee_leaves
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own leaves" ON public.employee_leaves;
CREATE POLICY "Users can update their own leaves" ON public.employee_leaves
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own leaves" ON public.employee_leaves;
CREATE POLICY "Users can delete their own leaves" ON public.employee_leaves
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ---------- RLS: work_shifts ----------
DROP POLICY IF EXISTS "Users manage own shifts" ON public.work_shifts;
CREATE POLICY "Users manage own shifts" ON public.work_shifts
  FOR ALL USING (
    (select auth.uid()) = user_id
    OR is_team_member((select auth.uid()), user_id)
  );

-- ---------- RLS: official_holidays ----------
DROP POLICY IF EXISTS "Users manage own holidays" ON public.official_holidays;
CREATE POLICY "Users manage own holidays" ON public.official_holidays
  FOR ALL USING (
    (select auth.uid()) = user_id
    OR is_team_member((select auth.uid()), user_id)
  );

-- ---------- RLS: departments ----------
DROP POLICY IF EXISTS "departments_delete_own" ON public.departments;
CREATE POLICY "departments_delete_own" ON public.departments
  FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "departments_insert_own" ON public.departments;
CREATE POLICY "departments_insert_own" ON public.departments
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "departments_update_own" ON public.departments;
CREATE POLICY "departments_update_own" ON public.departments
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "departments_select_tenant_members" ON public.departments;
CREATE POLICY "departments_select_tenant_members" ON public.departments
  FOR SELECT USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM employees e
      WHERE e.auth_user_id = (select auth.uid())
        AND e.user_id = departments.user_id
        AND COALESCE(e.is_active, true) = true
        AND COALESCE(e.is_terminated, false) = false
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = (select auth.uid())
        AND p.invited_by = departments.user_id
    )
  );

-- ---------- RLS: branches ----------
DROP POLICY IF EXISTS "HR can view branches" ON public.branches;
CREATE POLICY "HR can view branches" ON public.branches
  FOR SELECT USING (has_role((select auth.uid()), 'hr_manager'::app_role));

DROP POLICY IF EXISTS "Owner can manage branches" ON public.branches;
CREATE POLICY "Owner can manage branches" ON public.branches
  FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Super admins can view branches" ON public.branches;
CREATE POLICY "Super admins can view branches" ON public.branches
  FOR SELECT USING (has_role((select auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Team members can view branches" ON public.branches;
CREATE POLICY "Team members can view branches" ON public.branches
  FOR SELECT USING (user_id = (SELECT get_team_owner_id((select auth.uid()))));
