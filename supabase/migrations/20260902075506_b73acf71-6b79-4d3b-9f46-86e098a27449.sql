CREATE OR REPLACE FUNCTION public.hr_backfill_attendance(p_employee_id uuid, p_from date, p_to date, p_check_in time without time zone, p_check_out time without time zone, p_reason text, p_overwrite boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_emp record;
  v_branch_id uuid;
  v_day date;
  v_inserted int := 0;
  v_skipped int := 0;
  v_overwritten int := 0;
  v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_check_in_ts timestamptz;
  v_check_out_ts timestamptz;
  v_total_hours numeric;
  v_status text;
  v_existing_events int;
  v_existing_day boolean;
  v_day_id uuid;
  v_tz text := 'Asia/Jerusalem';
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_caller, 'hr_manager'::app_role) OR public.has_role(v_caller, 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized: HR manager or admin role required';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN RAISE EXCEPTION 'invalid date range'; END IF;
  IF p_check_in IS NULL OR p_check_out IS NULL THEN RAISE EXCEPTION 'check_in and check_out are required'; END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN RAISE EXCEPTION 'reason is required'; END IF;

  SELECT e.id, e.user_id, e.auth_user_id, e.branch_id, e.full_name, e.is_active
    INTO v_emp FROM public.employees e WHERE e.id = p_employee_id;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'employee not found'; END IF;
  IF NOT public.is_team_member(v_caller, v_emp.user_id) THEN
    RAISE EXCEPTION 'employee is not part of your team';
  END IF;

  v_branch_id := v_emp.branch_id;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد فرع مرتبط بالموظف. الرجاء تعيين فرع للموظف قبل توليد البصمات.';
  END IF;

  v_day := p_from;
  WHILE v_day <= p_to LOOP
    BEGIN
      SELECT COUNT(*) INTO v_existing_events
        FROM public.attendance_events ae
       WHERE ae.employee_id = p_employee_id
         AND (ae.event_time AT TIME ZONE v_tz)::date = v_day;

      v_existing_day := EXISTS (
        SELECT 1 FROM public.attendance_days ad
         WHERE ad.employee_id = p_employee_id
           AND ad.attendance_date = v_day
           AND (ad.first_check_in IS NOT NULL OR ad.last_check_out IS NOT NULL)
      );

      IF (v_existing_events > 0 OR v_existing_day) AND NOT p_overwrite THEN
        v_skipped := v_skipped + 1;
      ELSE
        IF p_overwrite AND v_existing_events > 0 THEN
          DELETE FROM public.attendance_events ae
           WHERE ae.employee_id = p_employee_id
             AND (ae.event_time AT TIME ZONE v_tz)::date = v_day;
          v_overwritten := v_overwritten + 1;
        END IF;

        v_check_in_ts := (v_day::timestamp + p_check_in) AT TIME ZONE v_tz;
        v_check_out_ts := (v_day::timestamp + p_check_out) AT TIME ZONE v_tz;
        IF v_check_out_ts <= v_check_in_ts THEN
          v_check_out_ts := ((v_day + 1)::timestamp + p_check_out) AT TIME ZONE v_tz;
        END IF;
        v_total_hours := ROUND(EXTRACT(EPOCH FROM (v_check_out_ts - v_check_in_ts)) / 3600.0, 2);
        v_status := 'present';

        INSERT INTO public.attendance_events(
          employee_id, auth_user_id, branch_id, event_type, event_time, status, notes, server_recorded
        ) VALUES (
          p_employee_id, COALESCE(v_emp.auth_user_id, v_emp.user_id), v_branch_id, 'check_in', v_check_in_ts, 'manual', p_reason, false
        );

        INSERT INTO public.attendance_events(
          employee_id, auth_user_id, branch_id, event_type, event_time, status, notes, server_recorded
        ) VALUES (
          p_employee_id, COALESCE(v_emp.auth_user_id, v_emp.user_id), v_branch_id, 'check_out', v_check_out_ts, 'manual', p_reason, false
        );

        INSERT INTO public.attendance_days(
          employee_id, auth_user_id, branch_id, attendance_date,
          first_check_in, last_check_out, total_hours, status,
          is_manually_adjusted, notes
        ) VALUES (
          p_employee_id, COALESCE(v_emp.auth_user_id, v_emp.user_id), v_branch_id, v_day,
          v_check_in_ts, v_check_out_ts, v_total_hours, v_status, true, p_reason
        )
        ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
          first_check_in = EXCLUDED.first_check_in,
          last_check_out = EXCLUDED.last_check_out,
          total_hours = EXCLUDED.total_hours,
          status = EXCLUDED.status,
          auth_user_id = EXCLUDED.auth_user_id,
          is_manually_adjusted = true,
          notes = COALESCE(public.attendance_days.notes || ' | ', '') || EXCLUDED.notes,
          updated_at = now()
        RETURNING id INTO v_day_id;

        INSERT INTO public.attendance_audit_logs(
          table_name, record_id, action, new_values, changed_by, reason
        ) VALUES (
          'attendance_days', v_day_id,
          CASE WHEN p_overwrite AND v_existing_day THEN 'overwrite' ELSE 'insert' END,
          jsonb_build_object(
            'attendance_date', v_day,
            'first_check_in', v_check_in_ts,
            'last_check_out', v_check_out_ts,
            'total_hours', v_total_hours,
            'status', v_status,
            'source', 'hr_backfill',
            'overwrite', p_overwrite,
            'branch_id', v_branch_id
          ),
          v_caller, p_reason
        );

        v_inserted := v_inserted + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('date', v_day, 'error', SQLERRM);
    END;
    v_day := v_day + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted, 'skipped', v_skipped,
    'overwritten', v_overwritten, 'failed', v_failed, 'errors', v_errors
  );
END;
$function$;