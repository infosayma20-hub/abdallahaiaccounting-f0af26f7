DO $$
DECLARE
  v_old uuid := 'c66bcb67-8324-4bd2-b33b-cfbfb3f8fba8'; -- kayedmalik33@gmail.com
  v_new uuid := '6b64352e-c197-4946-896a-6eb98a80d9e0'; -- malekkayed@malaky.com
  v_emp uuid := '31b11883-445f-469c-ba53-25c13352244d';
BEGIN
  UPDATE public.attendance_events SET auth_user_id = v_new WHERE employee_id = v_emp AND auth_user_id = v_old;
  UPDATE public.attendance_days   SET auth_user_id = v_new WHERE employee_id = v_emp AND auth_user_id = v_old;
  UPDATE public.attendance_breaks SET auth_user_id = v_new WHERE auth_user_id = v_old;
  UPDATE public.attendance_event_verifications SET auth_user_id = v_new WHERE auth_user_id = v_old;
  UPDATE public.correction_requests SET auth_user_id = v_new WHERE auth_user_id = v_old;
  UPDATE public.employee_device_alerts SET auth_user_id = v_new WHERE auth_user_id = v_old;
  UPDATE public.employee_trusted_devices SET auth_user_id = v_new WHERE auth_user_id = v_old;
  UPDATE public.device_tokens SET user_id = v_new WHERE user_id = v_old;
  UPDATE public.employees SET auth_user_id = v_new, updated_at = now() WHERE id = v_emp;
END $$;