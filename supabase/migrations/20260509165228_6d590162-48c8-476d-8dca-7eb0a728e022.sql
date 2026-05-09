
-- Extend HR Manager permissions with granular toggles. All new flags default FALSE
-- (forward-safe). Owners must explicitly enable each one per HR manager.

ALTER TABLE public.hr_manager_permissions
  -- Employees
  ADD COLUMN IF NOT EXISTS can_view_employees boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_employee_documents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_employee_documents boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_employee_bank_info boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_employee_private_info boolean NOT NULL DEFAULT false,
  -- Attendance
  ADD COLUMN IF NOT EXISTS can_view_attendance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_attendance_corrections boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_issue_penalties boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_gps_qr_details boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_attendance boolean NOT NULL DEFAULT false,
  -- Roster / Shifts
  ADD COLUMN IF NOT EXISTS can_view_roster boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_schedule boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_publish_roster boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_shift_templates boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_day_types boolean NOT NULL DEFAULT false,
  -- Leaves / Requests
  ADD COLUMN IF NOT EXISTS can_view_leaves boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_employee_requests boolean NOT NULL DEFAULT false,
  -- Payroll
  ADD COLUMN IF NOT EXISTS can_view_payroll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_preview_payroll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pay_payroll boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_staff_cost boolean NOT NULL DEFAULT false,
  -- Reports
  ADD COLUMN IF NOT EXISTS can_view_hr_payroll_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_hr_attendance_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_hr_leave_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_hr_staff_cost_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_print_hr_reports boolean NOT NULL DEFAULT false,
  -- Employee portal / team
  ADD COLUMN IF NOT EXISTS can_view_team_schedule_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_team_schedule_visibility boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_employee_portal_links boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_reset_employee_passwords boolean NOT NULL DEFAULT false;
