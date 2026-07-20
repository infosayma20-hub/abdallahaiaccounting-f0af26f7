CREATE OR REPLACE FUNCTION public.recompute_attendance_day(p_employee_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start  timestamptz := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_end    timestamptz := ((p_date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_auth   uuid;
  v_branch uuid;
  v_daily_hours numeric;
  v_first  timestamptz;
  v_last   timestamptz;
  v_total_hours numeric := 0;
  v_session_start timestamptz := NULL;
  v_currently_in boolean := false;
  v_status text := 'present';
  v_hour int;
  v_break_min int := 0;
  v_net_min int;
  v_last_type text;
  v_last_time timestamptz;
  v_manual boolean := false;
  v_manual_first timestamptz;
  v_manual_last  timestamptz;
  v_manual_status text;
  r record;
BEGIN
  SELECT auth_user_id, branch_id, COALESCE(is_manually_adjusted,false),
         first_check_in, last_check_out, status
    FROM public.attendance_days
    WHERE employee_id = p_employee_id AND attendance_date = p_date
    INTO v_auth, v_branch, v_manual, v_manual_first, v_manual_last, v_manual_status;

  IF v_auth IS NULL THEN
    SELECT auth_user_id, branch_id FROM public.attendance_events
      WHERE employee_id = p_employee_id AND event_time >= v_start AND event_time < v_end AND status='valid'
      ORDER BY event_time LIMIT 1
      INTO v_auth, v_branch;
  END IF;

  SELECT COALESCE(work_hours_per_day, 8) FROM public.employees WHERE id = p_employee_id INTO v_daily_hours;
  v_daily_hours := COALESCE(v_daily_hours, 8);

  FOR r IN
    SELECT event_type, event_time
    FROM public.attendance_events
    WHERE employee_id = p_employee_id
      AND event_time >= v_start
      AND event_time < v_end
      AND status = 'valid'
    ORDER BY event_time ASC
  LOOP
    IF v_last_type IS NOT NULL AND v_last_type = r.event_type
       AND (r.event_time - v_last_time) < interval '60 seconds' THEN
      CONTINUE;
    END IF;
    v_last_type := r.event_type;
    v_last_time := r.event_time;

    IF v_first IS NULL AND r.event_type = 'check_in' THEN
      v_first := r.event_time;
    END IF;

    IF r.event_type = 'check_in' THEN
      IF v_session_start IS NULL THEN v_session_start := r.event_time; END IF;
      v_currently_in := true;
    ELSIF r.event_type = 'check_out' AND v_session_start IS NOT NULL THEN
      IF (r.event_time - v_session_start) >= interval '60 seconds' THEN
        v_total_hours := v_total_hours + EXTRACT(EPOCH FROM (r.event_time - v_session_start))/3600.0;
      END IF;
      v_session_start := NULL;
      v_last := r.event_time;
      v_currently_in := false;
    END IF;
  END LOOP;

  -- 🛡️ Manual override: if HR edited this day, keep their times.
  -- Fill missing side from raw events if HR only supplied one side.
  IF v_manual THEN
    IF v_manual_first IS NOT NULL THEN v_first := v_manual_first; END IF;
    IF v_manual_last  IS NOT NULL THEN v_last  := v_manual_last;  END IF;
    IF v_first IS NOT NULL AND v_last IS NOT NULL AND v_last > v_first THEN
      v_total_hours := EXTRACT(EPOCH FROM (v_last - v_first))/3600.0;
      v_currently_in := false;
    END IF;
  END IF;

  SELECT COALESCE(SUM(duration_minutes),0)::int FROM public.attendance_breaks
    WHERE employee_id = p_employee_id
      AND break_out >= v_start AND break_out < v_end
      AND break_in IS NOT NULL
    INTO v_break_min;

  v_net_min := GREATEST(0, ROUND(v_total_hours*60)::int - v_break_min);

  v_hour := EXTRACT(HOUR FROM (COALESCE(v_first, v_last, now()) AT TIME ZONE 'Asia/Hebron'))::int;
  IF v_hour >= 9 THEN v_status := 'late'; ELSE v_status := 'present'; END IF;
  IF NOT v_currently_in AND v_last IS NOT NULL THEN
    IF v_total_hours <= 0 THEN v_status := 'incomplete'; END IF;
  END IF;

  -- Preserve manual status override (e.g. HR chose 'present' explicitly)
  IF v_manual AND v_manual_status IS NOT NULL THEN
    v_status := v_manual_status;
  END IF;

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
    ROUND(v_total_hours::numeric, 2),
    ROUND(GREATEST(0, v_total_hours - v_daily_hours)::numeric, 2),
    v_status, v_break_min, v_net_min, v_manual
  )
  ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
    first_check_in = EXCLUDED.first_check_in,
    last_check_out = EXCLUDED.last_check_out,
    total_hours    = EXCLUDED.total_hours,
    overtime_hours = EXCLUDED.overtime_hours,
    status         = EXCLUDED.status,
    total_break_minutes = EXCLUDED.total_break_minutes,
    net_work_minutes    = EXCLUDED.net_work_minutes;
END;
$function$;