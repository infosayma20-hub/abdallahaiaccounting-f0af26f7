
-- 1) BEFORE INSERT guard: auto-invalidate duplicate check_in within 60s of last valid check_out
CREATE OR REPLACE FUNCTION public.guard_attendance_duplicate_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prev_type text;
  prev_time timestamptz;
BEGIN
  IF NEW.event_type <> 'check_in' OR COALESCE(NEW.status,'valid') <> 'valid' THEN
    RETURN NEW;
  END IF;

  SELECT event_type, event_time
    INTO prev_type, prev_time
  FROM public.attendance_events
  WHERE employee_id = NEW.employee_id
    AND status = 'valid'
    AND event_time < NEW.event_time
  ORDER BY event_time DESC
  LIMIT 1;

  IF prev_type = 'check_out'
     AND (NEW.event_time - prev_time) <= interval '60 seconds' THEN
    NEW.status := 'invalid';
    NEW.notes  := COALESCE(NEW.notes || E'\n', '') ||
                  'auto-invalidated duplicate QR check_in within 60s of check_out';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_attendance_duplicate_checkin ON public.attendance_events;
CREATE TRIGGER trg_guard_attendance_duplicate_checkin
BEFORE INSERT ON public.attendance_events
FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_duplicate_checkin();

-- 2) Recompute attendance_days from valid events (mirrors edge function logic)
CREATE OR REPLACE FUNCTION public.recompute_attendance_day(
  p_employee_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  r record;
BEGIN
  SELECT auth_user_id, branch_id FROM public.attendance_days
    WHERE employee_id = p_employee_id AND attendance_date = p_date
    INTO v_auth, v_branch;

  IF v_auth IS NULL THEN
    SELECT auth_user_id, branch_id FROM public.attendance_events
      WHERE employee_id = p_employee_id AND event_time >= v_start AND event_time < v_end AND status='valid'
      ORDER BY event_time LIMIT 1
      INTO v_auth, v_branch;
  END IF;

  SELECT COALESCE(work_hours_per_day, 8) FROM public.employees WHERE id = p_employee_id INTO v_daily_hours;
  v_daily_hours := COALESCE(v_daily_hours, 8);

  -- Debounce + pair
  FOR r IN
    SELECT event_type, event_time
    FROM public.attendance_events
    WHERE employee_id = p_employee_id
      AND event_time >= v_start
      AND event_time < v_end
      AND status = 'valid'
    ORDER BY event_time ASC
  LOOP
    -- Same-type within 60s → skip
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

  -- Breaks
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

  IF v_first IS NULL AND v_last IS NULL THEN
    -- No valid events left for the day → delete the row
    DELETE FROM public.attendance_days
      WHERE employee_id = p_employee_id AND attendance_date = p_date;
    RETURN;
  END IF;

  INSERT INTO public.attendance_days (
    employee_id, auth_user_id, branch_id, attendance_date,
    first_check_in, last_check_out, total_hours, overtime_hours,
    status, total_break_minutes, net_work_minutes
  ) VALUES (
    p_employee_id, v_auth, v_branch, p_date,
    v_first, v_last,
    ROUND(v_total_hours::numeric, 2),
    ROUND(GREATEST(0, v_total_hours - v_daily_hours)::numeric, 2),
    v_status, v_break_min, v_net_min
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
$$;

GRANT EXECUTE ON FUNCTION public.recompute_attendance_day(uuid, date) TO service_role;
