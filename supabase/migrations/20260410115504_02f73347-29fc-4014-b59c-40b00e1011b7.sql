CREATE OR REPLACE VIEW public.employees_safe AS
  SELECT 
    id, user_id, full_name, position, department, job_title,
    branch_id, is_active, start_date, end_date,
    salary_type, work_days_per_week, work_hours_per_day,
    annual_leave_days, sick_leave_days,
    auth_user_id, photo_url, email, phone,
    created_at, updated_at,
    -- Sensitive fields visible to team members (employer + their team)
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN id_number ELSE '***' END AS id_number,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN bank_name ELSE NULL END AS bank_name,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN bank_account ELSE '***' END AS bank_account,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN base_salary ELSE 0 END AS base_salary,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN hourly_rate ELSE 0 END AS hourly_rate,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN emergency_contact ELSE NULL END AS emergency_contact,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN emergency_phone ELSE NULL END AS emergency_phone,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN address ELSE NULL END AS address,
    CASE WHEN public.is_team_member(auth.uid(), user_id) THEN notes ELSE NULL END AS notes
  FROM public.employees;