ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_departure_paid_within_cap boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_departure_policy_from date;

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
  -- سياسة المغادرات: مدفوعة ضمن السقف فقط
  v_owner uuid;
  v_pol_on boolean := false;
  v_pol_from date;
  v_cap int := 30;
  v_max_gap int := 300;
  v_gap_min int := 0;
  v_gap int;
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

  SELECT COALESCE(work_hours_per_day, 8), user_id FROM public.employees WHERE id = p_employee_id
    INTO v_daily_hours, v_owner;
  v_daily_hours := COALESCE(v_daily_hours, 8);

  IF v_owner IS NOT NULL THEN
    SELECT COALESCE(cs.hr_departure_cap_enabled,false) AND COALESCE(cs.hr_departure_paid_within_cap,false),
           cs.hr_departure_policy_from,
           COALESCE(NULLIF(cs.hr_departure_cap_minutes,0),30),
           COALESCE(NULLIF(cs.hr_departure_max_gap_minutes,0),300)
      INTO v_pol_on, v_pol_from, v_cap, v_max_gap
    FROM public.company_settings cs WHERE cs.user_id = v_owner LIMIT 1;
  END IF;
  -- الأيام السابقة لتاريخ بدء السياسة لا تتأثر إطلاقاً
  v_pol_on := COALESCE(v_pol_on,false) AND v_pol_from IS NOT NULL AND p_date >= v_pol_from;

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
      IF v_session_start IS NULL THEN
        -- فجوة بين نهاية الجلسة السابقة وبداية هذه الجلسة = مغادرة
        IF v_last IS NOT NULL THEN
          v_gap := FLOOR(EXTRACT(EPOCH FROM (r.event_time - v_last))/60)::int;
          IF v_gap >= 2 AND v_gap <= v_max_gap THEN
            v_gap_min := v_gap_min + v_gap;
          END IF;
        END IF;
        v_session_start := r.event_time;
      END IF;
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
  IF v_manual THEN
    IF v_manual_first IS NOT NULL THEN v_first := v_manual_first; END IF;
    IF v_manual_last  IS NOT NULL THEN v_last  := v_manual_last;  END IF;
    IF v_first IS NOT NULL AND v_last IS NOT NULL AND v_last > v_first THEN
      v_total_hours := EXTRACT(EPOCH FROM (v_last - v_first))/3600.0;
      v_currently_in := false;
      -- الحفظ اليدوي يشمل الفجوات كاملة → نستبعد فقط ما تجاوز السقف
      IF v_pol_on AND v_gap_min > v_cap THEN
        v_total_hours := GREATEST(0, v_total_hours - (v_gap_min - v_cap)/60.0);
      END IF;
    END IF;
  ELSIF v_pol_on AND v_gap_min > 0 THEN
    -- الحساب الآلي يستبعد الفجوات كاملة → نعيد المدفوع منها ضمن السقف
    v_total_hours := v_total_hours + LEAST(v_gap_min, v_cap)/60.0;
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