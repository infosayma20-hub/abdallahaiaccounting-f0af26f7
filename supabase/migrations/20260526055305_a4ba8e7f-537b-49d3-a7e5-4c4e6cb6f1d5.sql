
-- 1) EMPLOYEES
DROP VIEW IF EXISTS public.employees_safe;

CREATE VIEW public.employees_safe
WITH (security_invoker=on) AS
SELECT
  id, user_id, full_name, "position", department, job_title, branch_id,
  is_active, start_date, end_date, salary_type, work_days_per_week,
  work_hours_per_day, annual_leave_days, sick_leave_days, auth_user_id,
  photo_url, email, phone, created_at, updated_at,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN id_number ELSE '***'::text END AS id_number,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN bank_name ELSE NULL END AS bank_name,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN bank_account ELSE '***'::text END AS bank_account,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN base_salary ELSE 0::numeric END AS base_salary,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN hourly_rate ELSE 0::numeric END AS hourly_rate,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN emergency_contact ELSE NULL END AS emergency_contact,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN emergency_phone ELSE NULL END AS emergency_phone,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN address ELSE NULL END AS address,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN date_of_birth ELSE NULL END AS date_of_birth,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'hr_manager'::app_role)
       THEN notes ELSE NULL END AS notes
FROM public.employees;

GRANT SELECT ON public.employees_safe TO authenticated;

REVOKE SELECT ON public.employees FROM anon, authenticated;

GRANT SELECT (
  id, user_id, full_name, "position", department, job_title, start_date, end_date,
  is_active, salary_type, work_days_per_week, work_hours_per_day,
  annual_leave_days, sick_leave_days, photo_url, email, phone,
  created_at, updated_at, auth_user_id, branch_id, marital_status,
  children_count, spouse_allowance_amount, child_allowance_per_child,
  annual_leave_balance, previous_year_balance, shift_id, is_terminated,
  terminated_at, termination_reason, gender, nationality, contract_type,
  transportation_allowance_per_day, meal_allowance_per_day, admin_allowance,
  transfer_allowance, food_transport_override, wives_count, other_allowances,
  special_work_allowance, company_id, fingerprint_id, is_manager, is_hr_manager,
  employee_number, shift_start, shift_end, opening_balance, opening_balance_type,
  opening_balance_date, department_id, job_title_id, payroll_policy_id,
  payroll_overrides, manager_employee_id, can_view_team, can_manage_schedule,
  can_manage_attendance, show_in_employee_team_schedule
) ON public.employees TO authenticated;

-- 2) TRAVEL PASSENGERS
DROP VIEW IF EXISTS public.travel_booking_passengers_safe;

CREATE VIEW public.travel_booking_passengers_safe
WITH (security_invoker=on) AS
SELECT
  id, booking_id, full_name, full_name_en, nationality, gender,
  ticket_number, notes, passenger_index, phone, email, mahram_name,
  room_type, user_id,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role)
       THEN passport_number ELSE '***'::text END AS passport_number,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role)
       THEN national_id ELSE '***'::text END AS national_id,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role)
       THEN passport_image_url ELSE NULL END AS passport_image_url,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role)
       THEN date_of_birth ELSE NULL END AS date_of_birth,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role)
       THEN passport_expiry ELSE NULL END AS passport_expiry,
  CASE WHEN public.has_role(auth.uid(),'admin'::app_role)
       THEN passport_issue_date ELSE NULL END AS passport_issue_date
FROM public.travel_booking_passengers;

GRANT SELECT ON public.travel_booking_passengers_safe TO authenticated;

REVOKE SELECT ON public.travel_booking_passengers FROM anon, authenticated;

GRANT SELECT (
  id, booking_id, full_name, full_name_en, nationality, gender,
  ticket_number, notes, passenger_index, phone, email, mahram_name,
  room_type, user_id
) ON public.travel_booking_passengers TO authenticated;

-- 3) realtime.messages
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users only" ON realtime.messages;
CREATE POLICY "Authenticated users only"
  ON realtime.messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can broadcast" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast"
  ON realtime.messages FOR INSERT TO authenticated WITH CHECK (true);
