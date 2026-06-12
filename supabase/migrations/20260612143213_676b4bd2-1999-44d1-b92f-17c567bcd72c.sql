
DO $$
DECLARE
  v_company uuid := 'b4a221be-7b96-4952-8eb8-6ca749b46ca4';
  v_owner uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_sufyan uuid := 'ff450748-20b4-4ceb-b77b-40c470f625c4';
  v_faisal uuid := '6296a204-7c0a-419f-9904-ec11889e012f';
  v_pw text := crypt('123456', gen_salt('bf'));
  v_emp record;
  v_uid uuid;
  v_eid uuid;
  v_ps_start int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(payslip_number FROM 'PS-2026-05-(.+)')::int),0) INTO v_ps_start
  FROM employee_payroll WHERE payslip_number LIKE 'PS-2026-05-%';

  FOR v_emp IN
    SELECT * FROM (VALUES
      ('محمد شولي', '169', 'mohammadshouli@malaky.com', v_sufyan, 5, 113.09, 16.73, 0, 0, 1085.66, 100, 100, 0, 0, 0, 0, 7.5, 1178.16),
      ('بتول شتيه', '582', 'batoulshtayeh@malaky.com', v_faisal, 23, 199.92, 8.86, 0, 0, 1919.232, 720, 200, 520, 0, 0, 0, 66.456, 2072.776),
      ('محمد سعاده', '583', 'mohammadsaadeh@malaky.com', v_faisal, 6, 39.27, 0, 0, 0, 376.992, 100, 100, 0, 0, 0, 0, 50.448, 426.544),
      ('يزن بسطامي', '584', 'yazanbastami@malaky.com', v_faisal, 15, 113.30, 0, 0, 0, 1087.68, 100, 100, 0, 0, 0, 0, 53.78, 1133.9),
      ('سلطان شعبلو', '587', 'sultanshaablou@malaky.com', v_sufyan, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
      ('محمد صلاحات', '1095', 'mohammadsalahat@malaky.com', NULL, 16, 102.83, 0, 0, 0, 987.168, 0, 0, 0, 0, 0, 0, 98.952, 888.216),
      ('سائد عرام', '1096', 'saedaaram@malaky.com', NULL, 25, 158.66, 0, 0, 0, 1523.136, 0, 0, 0, 0, 0, 0, 46.772, 1476.364),
      ('محمد شكوكاني', '1097', 'mohammadshakukani@malaky.com', NULL, 8, 53.66, 0, 0, 0, 515.136, 0, 0, 0, 0, 0, 0, 18.88, 496.256),
      ('وضاح رداد', '1100', 'waddahraddad@malaky.com', NULL, 21, 130.45, 0, 0, 0, 1252.32, 0, 0, 0, 0, 0, 0, 75.968, 1176.352),
      ('معاذ سايس', '1101', 'moazsayes@malaky.com', NULL, 13, 95.99, 0, 0, 0, 921.504, 0, 0, 0, 0, 0, 0, 52.576, 868.928),
      ('كريم خليلي', '1102', 'kareemkhalili@malaky.com', NULL, 10, 69.90, 0, 0, 0, 671.04, 0, 0, 0, 0, 0, 0, 36.496, 634.544),
      ('ابراهيم خلايلة', '1103', 'ibrahimkhalayleh@malaky.com', NULL, 12, 96.10, 0, 0, 0, 922.56, 0, 0, 0, 0, 0, 0, 37.728, 884.832)
    ) AS t(full_name, emp_no, email, branch_id, work_days, work_hours, overtime, annual_leave, sick_leave, attendance_salary, base_salary, annual_allowance, food_transport, family_allowance, deduction_food, deduction_other, surplus, net_salary)
  LOOP
    -- Create auth user
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, confirmation_token,
      recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_emp.email, v_pw, now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_emp.full_name),
      '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_emp.email),
      'email', now(), now(), now()
    );

    -- Create employee
    v_eid := gen_random_uuid();
    INSERT INTO employees (
      id, user_id, company_id, full_name, email, auth_user_id,
      employee_number, branch_id, is_active, salary_type,
      base_salary, start_date
    ) VALUES (
      v_eid, v_owner, v_company, v_emp.full_name, v_emp.email, v_uid,
      v_emp.emp_no, v_emp.branch_id, true, 'شهري',
      v_emp.base_salary, '2026-01-01'
    );

    -- Create payslip
    v_ps_start := v_ps_start + 1;
    INSERT INTO employee_payroll (
      user_id, employee_id, period_month, period_year,
      base_salary, total_allowances, total_deductions, total_overtime, net_salary,
      is_paid, company_id,
      attendance_salary, regular_hours, overtime_hours_val,
      annual_allowance, food_transport_net, family_allowance,
      deduction_food_individual, deduction_other,
      working_days, status, working_hours,
      annual_leave_days_taken, sick_leave_days,
      surplus_amount, branch_id, payslip_number
    ) VALUES (
      '1fcad604-bbfb-4d66-a32f-7eec3f27b4c7', v_eid, 5, 2026,
      v_emp.base_salary,
      v_emp.annual_allowance + v_emp.food_transport + v_emp.family_allowance,
      v_emp.deduction_food + v_emp.deduction_other + v_emp.surplus,
      v_emp.overtime, v_emp.net_salary,
      true, v_company,
      v_emp.attendance_salary, v_emp.work_hours, v_emp.overtime,
      v_emp.annual_allowance, v_emp.food_transport, v_emp.family_allowance,
      v_emp.deduction_food, v_emp.deduction_other,
      v_emp.work_days, 'paid', v_emp.work_hours,
      v_emp.annual_leave, v_emp.sick_leave,
      v_emp.surplus, v_emp.branch_id,
      'PS-2026-05-' || lpad(v_ps_start::text, 4, '0')
    );
  END LOOP;
END $$;
