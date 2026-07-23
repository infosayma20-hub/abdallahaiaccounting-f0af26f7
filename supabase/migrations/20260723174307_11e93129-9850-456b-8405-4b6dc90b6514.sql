
-- Create Fadi HR account mirroring Reham (hrmanager@malaky.com)
DO $$
DECLARE
  v_new_id uuid := gen_random_uuid();
  v_owner_id uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_company_id uuid := 'b4a221be-7b96-4952-8eb8-6ca749b46ca4';
  v_email text := 'hrfadi@malaky.com';
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM auth.users WHERE email = v_email;
  IF v_existing IS NOT NULL THEN
    v_new_id := v_existing;
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
      v_email, crypt('HR@11', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"فادي - الموارد البشرية"}'::jsonb,
      false, '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_new_id, v_new_id::text,
      jsonb_build_object('sub', v_new_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  END IF;

  -- Profile (linked to owner's team)
  INSERT INTO public.profiles (id, user_id, full_name, company_id, invited_by, role)
  VALUES (gen_random_uuid(), v_new_id, 'فادي - الموارد البشرية', v_company_id, v_owner_id, 'hr_manager')
  ON CONFLICT DO NOTHING;

  -- Role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_id, 'hr_manager')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- HR permissions row mirroring Reham (all true, owner = v_owner_id)
  INSERT INTO public.hr_manager_permissions (
    user_id, hr_auth_id, full_name, email, is_active,
    can_add_employees, can_edit_employees, can_delete_employees, can_view_salary_info,
    can_manage_attendance, can_edit_attendance, can_manage_branches, can_approve_leaves,
    can_manage_leave_policy, can_manage_holidays, can_process_payroll, can_approve_payroll,
    can_manage_deductions, can_manage_advances, can_manage_loans, can_approve_requests,
    can_manage_forms, can_view_hr_reports, can_export_hr_data, can_manage_hr_settings,
    can_view_employees, can_view_employee_documents, can_edit_employee_documents,
    can_view_employee_bank_info, can_view_employee_private_info, can_view_attendance,
    can_approve_attendance_corrections, can_issue_penalties, can_view_gps_qr_details,
    can_export_attendance, can_view_roster, can_manage_schedule, can_publish_roster,
    can_manage_shift_templates, can_manage_day_types, can_view_leaves,
    can_view_employee_requests, can_view_payroll, can_preview_payroll, can_pay_payroll,
    can_view_staff_cost, can_view_hr_payroll_reports, can_view_hr_attendance_reports,
    can_view_hr_leave_reports, can_view_hr_staff_cost_reports, can_print_hr_reports,
    can_view_team_schedule_admin, can_manage_team_schedule_visibility,
    can_view_employee_portal_links, can_reset_employee_passwords
  )
  SELECT
    v_owner_id, v_new_id, 'فادي - الموارد البشرية', v_email, true,
    true,true,true,true, true,true,true,true, true,true,true,true,
    true,true,true,true, true,true,true,true,
    true,true,true, true,true,true, true,true,true,
    true,true,true,true, true,true,true,
    true,true,true,true, true,true,true, true,true,true,
    true,true, true,true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.hr_manager_permissions WHERE hr_auth_id = v_new_id
  );
END $$;
