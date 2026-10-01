-- مرجع واحد لقواعد الحضور والمغادرات (تقرأه قاعدة البيانات والشاشات)
CREATE OR REPLACE FUNCTION public.attendance_departure_rules()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'timezone', 'Asia/Hebron',
    'business_day_start', '06:00',
    'min_gap_minutes', 2,
    'end_of_day_grace_minutes', 60,
    'dismissal_tolerance_seconds', 90,
    'default_cap_minutes', 30,
    'default_max_gap_minutes', 300
  )
$$;
GRANT EXECUTE ON FUNCTION public.attendance_departure_rules() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_attendance_day(p_employee_id uuid, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rules jsonb := public.attendance_departure_rules();
  v_tz text := v_rules->>'timezone';
  v_min_gap integer := (v_rules->>'min_gap_minutes')::int;
  v_eod_grace integer := (v_rules->>'end_of_day_grace_minutes')::int;
  v_dismiss_tol integer := (v_rules->>'dismissal_tolerance_seconds')::int;
  v_def_cap integer := (v_rules->>'default_cap_minutes')::int;
  v_def_max_gap integer := (v_rules->>'default_max_gap_minutes')::int;
  v_start timestamptz := (p_date::text || ' ' || (v_rules->>'business_day_start') || ':00')::timestamp AT TIME ZONE v_tz;
  v_end timestamptz := ((p_date + 1)::text || ' ' || (v_rules->>'business_day_start') || ':00')::timestamp AT TIME ZONE v_tz;
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
  v_pool_overlap integer := 0;
  v_pool_minutes integer := 0;
  v_net_minutes integer := 0;
  v_status text := 'present';
  v_manual boolean := false;
  v_manual_first timestamptz;
  v_manual_last timestamptz;
  v_manual_status text;
  v_manual_out_set boolean := true;
  v_override_first timestamptz;
  v_derived_out timestamptz;
  v_last_type text;
  v_last_time timestamptz;
  v_last_out timestamptz;
  v_last_out_kind text;
  v_gap_minutes integer;
  v_departure_minutes integer := 0;
  v_day_id uuid;
  v_paid_enabled boolean := false;
  v_dep_cap integer := v_def_cap;
  v_max_gap integer := v_def_max_gap;
  v_policy_from date;
  r record;
BEGIN
  SELECT ad.id, ad.auth_user_id, ad.branch_id, COALESCE(ad.is_manually_adjusted, false),
         ad.first_check_in, ad.last_check_out, ad.status, COALESCE(ad.manual_check_out_set, true)
    INTO v_day_id, v_auth, v_branch, v_manual, v_manual_first, v_manual_last, v_manual_status, v_manual_out_set
    FROM public.attendance_days ad
   WHERE ad.employee_id = p_employee_id
     AND ad.attendance_date = p_date;

  SELECT COALESCE(e.work_hours_per_day, 8), e.user_id
    INTO v_daily_hours, v_owner
    FROM public.employees e
   WHERE e.id = p_employee_id;
  v_daily_hours := COALESCE(v_daily_hours, 8);

  SELECT COALESCE(cs.hr_departure_paid_within_cap, false),
         COALESCE(NULLIF(cs.hr_departure_cap_minutes, 0), v_def_cap),
         COALESCE(NULLIF(cs.hr_departure_max_gap_minutes, 0), v_def_max_gap),
         COALESCE(cs.hr_departure_policy_from, DATE '2026-08-22')
    INTO v_paid_enabled, v_dep_cap, v_max_gap, v_policy_from
    FROM public.company_settings cs
   WHERE cs.user_id = v_owner;
  v_paid_enabled := COALESCE(v_paid_enabled, false);
  v_dep_cap := COALESCE(v_dep_cap, v_def_cap);
  v_max_gap := COALESCE(v_max_gap, v_def_max_gap);
  v_policy_from := COALESCE(v_policy_from, DATE '2026-08-22');

  -- تعديل جزئي: الموارد عدّلت وقت الدخول فقط، الجلسات تكمل من البصمات الحقيقية
  IF v_manual AND NOT v_manual_out_set THEN
    v_override_first := v_manual_first;
  END IF;

  IF v_manual AND v_manual_out_set THEN
    v_first := v_manual_first;
    v_last := v_manual_last;
    v_status := COALESCE(v_manual_status, 'present');

    -- تزامن محصور: يوم معدّل يدوياً بحالة "غير مكتمل" (دخول بدون خروج) فقط.
    -- إذا سجّل الموظف بصمة خروج حقيقية لاحقاً نعتمدها ونحدّث الحالة والساعات.
    IF v_first IS NOT NULL AND v_last IS NULL AND v_status = 'incomplete' THEN
      SELECT MAX(ae.event_time) INTO v_derived_out
        FROM public.attendance_events ae
       WHERE ae.employee_id = p_employee_id
         AND ae.event_type = 'check_out'
         AND ae.status IN ('valid', 'manual')
         AND ae.event_time > v_first
         AND ae.event_time >= v_start
         AND ae.event_time < v_end;
      IF v_derived_out IS NOT NULL THEN
        v_last := v_derived_out;
        v_status := CASE
          WHEN EXTRACT(HOUR FROM (v_first AT TIME ZONE v_tz)) >= 9 THEN 'late'
          ELSE 'present' END;
      END IF;
    END IF;

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

      SELECT COALESCE(SUM(ROUND(EXTRACT(EPOCH FROM (b.break_in - b.break_out))::numeric / 60.0)::integer), 0)::integer
        INTO v_pool_minutes
        FROM public.attendance_breaks b
       WHERE b.attendance_day_id = v_day_id
         AND b.break_in IS NOT NULL
         AND b.break_in > b.break_out
         AND NOT COALESCE(b.is_paid, false)
         AND COALESCE(b.counts_toward_cap, true)
         AND COALESCE(b.break_type, 'other') <> 'external_task';
    END IF;

    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);
    IF v_legacy THEN
      v_net_minutes := LEAST(v_net_minutes, v_net_cap_minutes);
    END IF;

    IF v_paid_enabled AND p_date >= v_policy_from THEN
      v_net_minutes := v_net_minutes + LEAST(v_pool_minutes, v_dep_cap);
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
        IF v_first IS NULL THEN
          v_first := COALESCE(v_override_first, r.event_time);
          IF v_override_first IS NOT NULL THEN
            v_session_start := v_override_first;
          END IF;
        END IF;
        IF v_session_start IS NULL THEN
          IF v_last_out IS NOT NULL AND r.event_time > v_last_out THEN
            v_gap_minutes := FLOOR(EXTRACT(EPOCH FROM (r.event_time - v_last_out)) / 60.0)::integer;
            IF v_gap_minutes >= v_min_gap
               AND ((v_last_out_kind = 'end_of_day' AND v_gap_minutes <= v_eod_grace)
                 OR (v_last_out_kind IS DISTINCT FROM 'end_of_day' AND v_gap_minutes <= v_max_gap))
               AND (v_day_id IS NULL OR NOT EXISTS (
                 SELECT 1 FROM public.attendance_derived_gap_dismissals dg
                  WHERE dg.attendance_day_id = v_day_id
                    AND ABS(EXTRACT(EPOCH FROM (dg.gap_out - v_last_out))) <= v_dismiss_tol
                    AND ABS(EXTRACT(EPOCH FROM (dg.gap_in - r.event_time))) <= v_dismiss_tol))
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
          ), 0)::integer,
          COALESCE(SUM(CASE WHEN (NOT COALESCE(b.is_paid, false))
                             AND COALESCE(b.counts_toward_cap, true)
                             AND COALESCE(b.break_type, 'other') <> 'external_task'
                       THEN ROUND(EXTRACT(EPOCH FROM (LEAST(b.break_in, v_session_end) - GREATEST(b.break_out, v_session_start)))::numeric / 60.0)::integer
                       ELSE 0 END), 0)::integer
          INTO v_overlap_minutes, v_overlap_all, v_pool_overlap
          FROM public.attendance_breaks b
         WHERE b.employee_id = p_employee_id
           AND b.break_in IS NOT NULL
           AND b.break_in > b.break_out
           AND b.break_out < v_session_end
           AND b.break_in > v_session_start;

        v_break_minutes := v_break_minutes + GREATEST(0, v_overlap_minutes);
        v_all_break_minutes := v_all_break_minutes + GREATEST(0, v_overlap_all);
        v_pool_minutes := v_pool_minutes + GREATEST(0, v_pool_overlap);
        v_last := v_session_end;
        v_last_out := v_session_end;
        v_last_out_kind := r.checkout_kind;
        v_session_start := NULL;
      END IF;
    END LOOP;

    IF v_first IS NULL AND v_override_first IS NOT NULL THEN
      v_first := v_override_first;
    END IF;

    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);

    IF v_paid_enabled AND p_date >= v_policy_from THEN
      v_net_minutes := v_net_minutes + LEAST(v_departure_minutes + v_pool_minutes, v_dep_cap);
    END IF;

    IF v_legacy THEN
      v_net_minutes := LEAST(v_net_minutes, v_net_cap_minutes);
    END IF;

    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE v_tz)) >= 9 THEN
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

DROP FUNCTION public.hr_update_attendance_day(uuid, timestamptz, timestamptz, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.hr_update_attendance_day(p_day_id uuid, p_first_check_in timestamp with time zone, p_last_check_out timestamp with time zone, p_status text, p_notes text, p_reason text, p_breaks jsonb DEFAULT '[]'::jsonb, p_dismissed_gaps jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day public.attendance_days%ROWTYPE;
  v_owner_id uuid;
  v_break jsonb;
  v_break_out timestamptz;
  v_break_in timestamptz;
  v_status text;
  v_gap jsonb;
  v_gap_out timestamptz;
  v_gap_in timestamptz;
  v_tol integer := (public.attendance_departure_rules()->>'dismissal_tolerance_seconds')::int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'سبب التعديل إلزامي';
  END IF;
  IF p_status NOT IN ('present','absent','late','incomplete','leave','holiday') THEN
    RAISE EXCEPTION 'حالة الحضور غير صالحة';
  END IF;
  v_status := p_status;

  IF p_first_check_in IS NULL AND p_last_check_out IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن إدخال وقت خروج بدون وقت دخول';
  END IF;
  IF p_first_check_in IS NOT NULL AND p_last_check_out IS NULL THEN
    v_status := 'incomplete';
    IF jsonb_array_length(COALESCE(p_breaks, '[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'لا يمكن إضافة جلسات خروج/عودة بدون وقت خروج';
    END IF;
  END IF;
  IF p_first_check_in IS NOT NULL AND p_last_check_out IS NOT NULL
     AND p_last_check_out <= p_first_check_in THEN
    RAISE EXCEPTION 'وقت الخروج يجب أن يكون بعد وقت الدخول';
  END IF;
  IF jsonb_typeof(COALESCE(p_dismissed_gaps, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'بيانات المغادرات المستبعدة غير صالحة';
  END IF;
  IF jsonb_typeof(COALESCE(p_breaks, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'بيانات الجلسات غير صالحة';
  END IF;

  SELECT ad.* INTO v_day
    FROM public.attendance_days ad
   WHERE ad.id = p_day_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل الحضور غير موجود';
  END IF;

  SELECT e.user_id INTO v_owner_id
    FROM public.employees e WHERE e.id = v_day.employee_id;

  IF NOT (
    (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.is_team_member(auth.uid(), v_owner_id)
  ) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل حضور هذا الموظف';
  END IF;

  UPDATE public.attendance_days
     SET first_check_in = p_first_check_in,
         last_check_out = p_last_check_out,
         status = v_status,
         notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
         is_manually_adjusted = true,
         manual_check_out_set = (p_last_check_out IS NOT NULL),
         updated_at = now()
   WHERE id = p_day_id;

  DELETE FROM public.attendance_breaks WHERE attendance_day_id = p_day_id;

  FOR v_break IN SELECT value FROM jsonb_array_elements(COALESCE(p_breaks, '[]'::jsonb))
  LOOP
    v_break_out := NULLIF(v_break->>'break_out', '')::timestamptz;
    v_break_in := NULLIF(v_break->>'break_in', '')::timestamptz;
    IF v_break_out IS NULL OR v_break_in IS NULL OR v_break_in <= v_break_out THEN
      RAISE EXCEPTION 'وقت جلسة الخروج والعودة غير صالح';
    END IF;
    IF p_first_check_in IS NULL OR p_last_check_out IS NULL
       OR v_break_out < p_first_check_in OR v_break_in > p_last_check_out THEN
      RAISE EXCEPTION 'الجلسة يجب أن تكون داخل وقت الدوام المعدل';
    END IF;

    INSERT INTO public.attendance_breaks (
      attendance_day_id, employee_id, auth_user_id, branch_id,
      break_type, break_out, break_in, reason
    ) VALUES (
      p_day_id, v_day.employee_id, v_day.auth_user_id, v_day.branch_id,
      CASE WHEN v_break->>'break_type' IN ('prayer','personal','meal','external_task','other')
           THEN v_break->>'break_type' ELSE 'other' END,
      v_break_out, v_break_in,
      COALESCE(NULLIF(btrim(v_break->>'reason'), ''), 'تعديل يدوي من الموارد البشرية')
    );
  END LOOP;

  -- استبعاد المغادرات المستنتجة داخل نفس المعاملة: إما يُحفظ كل شيء أو لا شيء
  FOR v_gap IN SELECT value FROM jsonb_array_elements(COALESCE(p_dismissed_gaps, '[]'::jsonb))
  LOOP
    v_gap_out := NULLIF(v_gap->>'gap_out', '')::timestamptz;
    v_gap_in := NULLIF(v_gap->>'gap_in', '')::timestamptz;
    IF v_gap_out IS NULL OR v_gap_in IS NULL OR v_gap_in <= v_gap_out THEN
      RAISE EXCEPTION 'وقت المغادرة المستبعدة غير صالح';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.attendance_derived_gap_dismissals dg
       WHERE dg.attendance_day_id = p_day_id
         AND ABS(EXTRACT(EPOCH FROM (dg.gap_out - v_gap_out))) <= v_tol
         AND ABS(EXTRACT(EPOCH FROM (dg.gap_in - v_gap_in))) <= v_tol
    ) THEN
      INSERT INTO public.attendance_derived_gap_dismissals (
        attendance_day_id, employee_id, gap_out, gap_in, reason, dismissed_by
      ) VALUES (
        p_day_id, v_day.employee_id, v_gap_out, v_gap_in, btrim(p_reason), auth.uid()
      );
    END IF;
  END LOOP;

  PERFORM public.recompute_attendance_day(v_day.employee_id, v_day.attendance_date);

  INSERT INTO public.attendance_audit_logs (
    table_name, record_id, action, old_values, new_values, changed_by, reason
  ) VALUES (
    'attendance_days', p_day_id, 'update',
    jsonb_build_object(
      'first_check_in', v_day.first_check_in,
      'last_check_out', v_day.last_check_out,
      'status', v_day.status,
      'notes', v_day.notes,
      'total_hours', v_day.total_hours,
      'overtime_hours', v_day.overtime_hours
    ),
    jsonb_build_object(
      'first_check_in', p_first_check_in,
      'last_check_out', p_last_check_out,
      'status', v_status,
      'notes', p_notes,
      'breaks', COALESCE(p_breaks, '[]'::jsonb),
      'dismissed_gaps', COALESCE(p_dismissed_gaps, '[]'::jsonb)
    ),
    auth.uid(), p_reason
  );

  RETURN (
    SELECT jsonb_build_object(
      'id', ad.id,
      'total_hours', ad.total_hours,
      'overtime_hours', ad.overtime_hours,
      'net_work_minutes', ad.net_work_minutes,
      'total_break_minutes', ad.total_break_minutes
    ) FROM public.attendance_days ad WHERE ad.id = p_day_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_update_attendance_day(uuid, timestamptz, timestamptz, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_update_attendance_day(uuid, timestamptz, timestamptz, text, text, text, jsonb, jsonb) TO authenticated, service_role;

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
  v_tz text := public.attendance_departure_rules()->>'timezone';
  v_day_start time := (public.attendance_departure_rules()->>'business_day_start')::time;
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
         AND ae.event_time >= (v_day::timestamp + v_day_start) AT TIME ZONE v_tz
         AND ae.event_time < ((v_day + 1)::timestamp + v_day_start) AT TIME ZONE v_tz;

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
             AND ae.event_time >= (v_day::timestamp + v_day_start) AT TIME ZONE v_tz
             AND ae.event_time < ((v_day + 1)::timestamp + v_day_start) AT TIME ZONE v_tz;
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
          is_manually_adjusted, manual_check_out_set, notes
        ) VALUES (
          p_employee_id, COALESCE(v_emp.auth_user_id, v_emp.user_id), v_branch_id, v_day,
          v_check_in_ts, v_check_out_ts, v_total_hours, v_status, true, true, p_reason
        )
        ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
          first_check_in = EXCLUDED.first_check_in,
          last_check_out = EXCLUDED.last_check_out,
          total_hours = EXCLUDED.total_hours,
          status = EXCLUDED.status,
          auth_user_id = EXCLUDED.auth_user_id,
          is_manually_adjusted = true,
          manual_check_out_set = true,
          notes = COALESCE(public.attendance_days.notes || ' | ', '') || EXCLUDED.notes,
          updated_at = now()
        RETURNING id INTO v_day_id;

        -- نفس محرك الحساب الأساسي (الصافي، الإضافي، الاستراحات، الحالة)
        PERFORM public.recompute_attendance_day(p_employee_id, v_day);
        SELECT ad.total_hours, ad.status INTO v_total_hours, v_status
          FROM public.attendance_days ad WHERE ad.id = v_day_id;

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