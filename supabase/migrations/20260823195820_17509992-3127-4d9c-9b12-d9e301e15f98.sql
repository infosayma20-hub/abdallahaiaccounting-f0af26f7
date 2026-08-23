CREATE OR REPLACE FUNCTION public.recompute_attendance_day(p_employee_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_end timestamptz := ((p_date + 1)::text || ' 06:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_legacy boolean := p_date < DATE '2026-08-21';
  v_net_cap_minutes integer := 960;
  v_hard_cap_minutes integer := 1440;
  v_session_minutes integer := 0;
  v_auth uuid;
  v_branch uuid;
  v_owner uuid;
  v_daily_hours numeric := 8;
  v_first timestamptz;
  v_last timestamptz;
  v_session_start timestamptz;
  v_session_end timestamptz;
  v_total_minutes integer := 0;
  v_break_minutes integer := 0;
  v_all_break_minutes integer := 0;
  v_overlap_minutes integer := 0;
  v_overlap_all integer := 0;
  v_net_minutes integer := 0;
  v_status text := 'present';
  v_manual boolean := false;
  v_manual_first timestamptz;
  v_manual_last timestamptz;
  v_manual_status text;
  v_last_type text;
  v_last_time timestamptz;
  v_last_out timestamptz;
  v_last_out_kind text;
  v_gap_minutes integer;
  v_departure_minutes integer := 0;
  v_day_id uuid;
  v_paid_enabled boolean := false;
  v_dep_cap integer := 30;
  v_max_gap integer := 300;
  v_policy_from date;
  r record;
BEGIN
  SELECT ad.id, ad.auth_user_id, ad.branch_id, COALESCE(ad.is_manually_adjusted, false),
         ad.first_check_in, ad.last_check_out, ad.status
    INTO v_day_id, v_auth, v_branch, v_manual, v_manual_first, v_manual_last, v_manual_status
    FROM public.attendance_days ad
   WHERE ad.employee_id = p_employee_id
     AND ad.attendance_date = p_date;

  SELECT COALESCE(e.work_hours_per_day, 8), e.user_id
    INTO v_daily_hours, v_owner
    FROM public.employees e
   WHERE e.id = p_employee_id;
  v_daily_hours := COALESCE(v_daily_hours, 8);

  SELECT COALESCE(cs.hr_departure_paid_within_cap, false),
         COALESCE(NULLIF(cs.hr_departure_cap_minutes, 0), 30),
         COALESCE(NULLIF(cs.hr_departure_max_gap_minutes, 0), 300),
         COALESCE(cs.hr_departure_policy_from, DATE '2026-08-22')
    INTO v_paid_enabled, v_dep_cap, v_max_gap, v_policy_from
    FROM public.company_settings cs
   WHERE cs.user_id = v_owner;
  v_paid_enabled := COALESCE(v_paid_enabled, false);
  v_dep_cap := COALESCE(v_dep_cap, 30);
  v_max_gap := COALESCE(v_max_gap, 300);
  v_policy_from := COALESCE(v_policy_from, DATE '2026-08-22');

  IF v_manual THEN
    v_first := v_manual_first;
    v_last := v_manual_last;
    v_status := COALESCE(v_manual_status, 'present');

    IF v_first IS NULL OR v_last IS NULL OR v_last <= v_first THEN
      v_total_minutes := 0;
      v_break_minutes := 0;
      v_all_break_minutes := 0;
    ELSE
      v_total_minutes := LEAST(
        ROUND(EXTRACT(EPOCH FROM (v_last - v_first))::numeric / 60.0)::integer,
        v_hard_cap_minutes
      );

      SELECT
        COALESCE(SUM(CASE WHEN b.is_paid AND NOT v_legacy THEN 0
                          ELSE ROUND(EXTRACT(EPOCH FROM (b.break_in - b.break_out))::numeric / 60.0)::integer END), 0)::integer,
        COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (b.break_in - b.break_out))::numeric / 60.0)::integer), 0)::integer
        INTO v_break_minutes, v_all_break_minutes
        FROM public.attendance_breaks b
       WHERE b.attendance_day_id = v_day_id
         AND b.break_in IS NOT NULL
         AND b.break_in > b.break_out;
    END IF;

    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);
    IF v_legacy THEN
      v_net_minutes := LEAST(v_net_minutes, v_net_cap_minutes);
    END IF;
  ELSE
    FOR r IN
      SELECT ae.event_type, ae.event_time, ae.auth_user_id, ae.branch_id, ae.checkout_kind
        FROM public.attendance_events ae
       WHERE ae.employee_id = p_employee_id
         AND ae.event_time >= v_start
         AND ae.event_time < v_end
         AND ae.status IN ('valid', 'manual')
       ORDER BY ae.event_time, ae.created_at
    LOOP
      IF v_last_type = r.event_type
         AND v_last_time IS NOT NULL
         AND r.event_time - v_last_time < interval '60 seconds' THEN
        CONTINUE;
      END IF;
      v_last_type := r.event_type;
      v_last_time := r.event_time;

      IF v_auth IS NULL THEN v_auth := r.auth_user_id; END IF;
      IF v_branch IS NULL THEN v_branch := r.branch_id; END IF;

      IF r.event_type = 'check_in' THEN
        IF v_first IS NULL THEN v_first := r.event_time; END IF;
        IF v_session_start IS NULL THEN
          IF v_last_out IS NOT NULL AND r.event_time > v_last_out THEN
            v_gap_minutes := FLOOR(EXTRACT(EPOCH FROM (r.event_time - v_last_out)) / 60.0)::integer;
            IF v_gap_minutes >= 2
               AND ((v_last_out_kind = 'end_of_day' AND v_gap_minutes <= 60)
                 OR (v_last_out_kind IS DISTINCT FROM 'end_of_day' AND v_gap_minutes <= v_max_gap))
               AND (v_day_id IS NULL OR NOT EXISTS (
                 SELECT 1 FROM public.attendance_derived_gap_dismissals dg
                  WHERE dg.attendance_day_id = v_day_id
                    AND ABS(EXTRACT(EPOCH FROM (dg.gap_out - v_last_out))) <= 90
                    AND ABS(EXTRACT(EPOCH FROM (dg.gap_in - r.event_time))) <= 90))
            THEN
              v_departure_minutes := v_departure_minutes + v_gap_minutes;
            END IF;
          END IF;
          v_session_start := r.event_time;
        END IF;
      ELSIF r.event_type = 'check_out' AND v_session_start IS NOT NULL AND r.event_time > v_session_start THEN
        v_session_end := r.event_time;
        v_session_minutes := ROUND(EXTRACT(EPOCH FROM (v_session_end - v_session_start))::numeric / 60.0)::integer;
        v_session_minutes := LEAST(v_session_minutes, v_hard_cap_minutes);
        v_total_minutes := v_total_minutes + v_session_minutes;

        SELECT
          COALESCE(SUM(CASE WHEN b.is_paid AND NOT v_legacy THEN 0 ELSE
            ROUND(EXTRACT(EPOCH FROM (LEAST(b.break_in, v_session_end) - GREATEST(b.break_out, v_session_start)))::numeric / 60.0)::integer
          END), 0)::integer,
          COALESCE(SUM(
            ROUND(EXTRACT(EPOCH FROM (LEAST(b.break_in, v_session_end) - GREATEST(b.break_out, v_session_start)))::numeric / 60.0)::integer
          ), 0)::integer
          INTO v_overlap_minutes, v_overlap_all
          FROM public.attendance_breaks b
         WHERE b.employee_id = p_employee_id
           AND b.break_in IS NOT NULL
           AND b.break_in > b.break_out
           AND b.break_out < v_session_end
           AND b.break_in > v_session_start;

        v_break_minutes := v_break_minutes + GREATEST(0, v_overlap_minutes);
        v_all_break_minutes := v_all_break_minutes + GREATEST(0, v_overlap_all);
        v_last := v_session_end;
        v_last_out := v_session_end;
        v_last_out_kind := r.checkout_kind;
        v_session_start := NULL;
      END IF;
    END LOOP;

    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);

    -- Departure allowance now applies to ALL days governed by the policy start
    -- date (hr_departure_policy_from), including legacy days. Legacy gating
    -- remains ONLY for paid-break handling above.
    IF v_paid_enabled AND p_date >= v_policy_from THEN
      v_net_minutes := v_net_minutes + LEAST(v_departure_minutes, v_dep_cap);
    END IF;

    v_net_minutes := LEAST(v_net_minutes, v_net_cap_minutes);

    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE 'Asia/Hebron')) >= 9 THEN
      v_status := 'late';
    END IF;
  END IF;

  IF v_auth IS NULL THEN
    SELECT e.user_id, e.branch_id INTO v_auth, v_branch
      FROM public.employees e WHERE e.id = p_employee_id;
  END IF;

  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'تعذر تحديد حساب الموظف';
  END IF;

  IF NOT v_manual AND v_first IS NULL THEN
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
    v_status, v_all_break_minutes, v_net_minutes, v_manual
  )
  ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
    first_check_in = EXCLUDED.first_check_in,
    last_check_out = EXCLUDED.last_check_out,
    total_hours = EXCLUDED.total_hours,
    overtime_hours = EXCLUDED.overtime_hours,
    status = EXCLUDED.status,
    total_break_minutes = EXCLUDED.total_break_minutes,
    net_work_minutes = EXCLUDED.net_work_minutes,
    is_manually_adjusted = EXCLUDED.is_manually_adjusted,
    updated_at = now();
END;
$function$;