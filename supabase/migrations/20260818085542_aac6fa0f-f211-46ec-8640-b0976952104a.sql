CREATE OR REPLACE FUNCTION public.recompute_attendance_day(p_employee_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_end timestamptz := ((p_date + 1)::text || ' 06:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_auth uuid;
  v_branch uuid;
  v_daily_hours numeric := 8;
  v_first timestamptz;
  v_last timestamptz;
  v_total_minutes integer := 0;
  v_overlap_break_minutes integer := 0;
  v_session_break_minutes integer := 0;
  v_session_start timestamptz;
  v_last_type text;
  v_last_time timestamptz;
  v_status text := 'present';
  v_manual boolean := false;
  v_manual_first timestamptz;
  v_manual_last timestamptz;
  v_manual_status text;
  v_break_minutes integer := 0;
  v_net_minutes integer := 0;
  r record;
BEGIN
  SELECT ad.auth_user_id, ad.branch_id, COALESCE(ad.is_manually_adjusted, false),
         ad.first_check_in, ad.last_check_out, ad.status
    INTO v_auth, v_branch, v_manual, v_manual_first, v_manual_last, v_manual_status
    FROM public.attendance_days ad
   WHERE ad.employee_id = p_employee_id
     AND ad.attendance_date = p_date;

  SELECT COALESCE(e.work_hours_per_day, 8)
    INTO v_daily_hours
    FROM public.employees e
   WHERE e.id = p_employee_id;
  v_daily_hours := COALESCE(v_daily_hours, 8);

  FOR r IN
    SELECT ae.event_type, ae.event_time, ae.auth_user_id, ae.branch_id
      FROM public.attendance_events ae
     WHERE ae.employee_id = p_employee_id
       AND ae.event_time >= v_start
       AND ae.event_time < v_end
       AND ae.status IN ('valid', 'manual')
     ORDER BY ae.event_time, ae.created_at
  LOOP
    IF v_last_type = r.event_type
       AND r.event_time - v_last_time < interval '60 seconds' THEN
      CONTINUE;
    END IF;
    v_last_type := r.event_type;
    v_last_time := r.event_time;

    IF v_auth IS NULL THEN v_auth := r.auth_user_id; END IF;
    IF v_branch IS NULL THEN v_branch := r.branch_id; END IF;

    IF r.event_type = 'check_in' THEN
      IF v_first IS NULL THEN v_first := r.event_time; END IF;
      IF v_session_start IS NULL THEN v_session_start := r.event_time; END IF;
    ELSIF r.event_type = 'check_out' AND v_session_start IS NOT NULL THEN
      IF r.event_time - v_session_start >= interval '60 seconds' THEN
        v_total_minutes := v_total_minutes + ROUND(EXTRACT(EPOCH FROM (r.event_time - v_session_start))::numeric / 60.0)::integer;

        SELECT COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (
          LEAST(b.break_in, r.event_time) - GREATEST(b.break_out, v_session_start)
        ))::numeric / 60.0)), 0)::integer
          INTO v_session_break_minutes
          FROM public.attendance_breaks b
         WHERE b.employee_id = p_employee_id
           AND b.break_in IS NOT NULL
           AND b.break_in > v_session_start
           AND b.break_out < r.event_time;

        v_overlap_break_minutes := v_overlap_break_minutes + GREATEST(0, v_session_break_minutes);
        v_last := r.event_time;
      END IF;
      v_session_start := NULL;
    END IF;
  END LOOP;

  IF v_manual THEN
    v_first := COALESCE(v_manual_first, v_first);
    v_last := COALESCE(v_manual_last, v_last);
    v_status := COALESCE(v_manual_status, v_status);
  ELSIF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE 'Asia/Hebron')) >= 9 THEN
    v_status := 'late';
  END IF;

  SELECT COALESCE(SUM(GREATEST(0, b.duration_minutes)), 0)::integer
    INTO v_break_minutes
    FROM public.attendance_breaks b
   WHERE b.employee_id = p_employee_id
     AND b.break_out >= v_start
     AND b.break_out < v_end
     AND b.break_in IS NOT NULL;

  IF v_total_minutes = 0 AND v_manual_first IS NOT NULL AND v_manual_last > v_manual_first THEN
    v_total_minutes := ROUND(EXTRACT(EPOCH FROM (v_manual_last - v_manual_first))::numeric / 60.0)::integer;
    v_overlap_break_minutes := v_break_minutes;
  END IF;

  v_net_minutes := GREATEST(0, v_total_minutes - v_overlap_break_minutes);

  IF v_first IS NULL AND v_last IS NULL THEN
    DELETE FROM public.attendance_days
     WHERE employee_id = p_employee_id AND attendance_date = p_date;
    RETURN;
  END IF;

  INSERT INTO public.attendance_days (
    employee_id, auth_user_id, branch_id, attendance_date,
    first_check_in, last_check_out, total_hours, overtime_hours,
    status, total_break_minutes, net_work_minutes, is_manually_adjusted
  ) VALUES (
    p_employee_id, v_auth, v_branch, p_date,
    v_first, v_last,
    ROUND(v_net_minutes::numeric / 60.0, 2),
    GREATEST(0, ROUND(v_net_minutes::numeric / 60.0 - v_daily_hours, 2)),
    v_status, v_break_minutes, v_net_minutes, v_manual
  )
  ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
    first_check_in = EXCLUDED.first_check_in,
    last_check_out = EXCLUDED.last_check_out,
    total_hours = EXCLUDED.total_hours,
    overtime_hours = EXCLUDED.overtime_hours,
    status = EXCLUDED.status,
    total_break_minutes = EXCLUDED.total_break_minutes,
    net_work_minutes = EXCLUDED.net_work_minutes,
    updated_at = now();
END;
$function$;