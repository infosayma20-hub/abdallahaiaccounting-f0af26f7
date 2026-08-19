CREATE OR REPLACE FUNCTION public.set_attendance_break_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.break_in IS NULL THEN
    NEW.duration_minutes := NULL;
  ELSIF NEW.break_in <= NEW.break_out THEN
    RAISE EXCEPTION 'وقت العودة يجب أن يكون بعد وقت الخروج';
  ELSE
    NEW.duration_minutes := ROUND(EXTRACT(EPOCH FROM (NEW.break_in - NEW.break_out))::numeric / 60.0)::integer;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_attendance_break_duration ON public.attendance_breaks;
CREATE TRIGGER trg_set_attendance_break_duration
BEFORE INSERT OR UPDATE OF break_out, break_in
ON public.attendance_breaks
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_break_duration();

CREATE OR REPLACE FUNCTION public.recompute_attendance_day(p_employee_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_end timestamptz := ((p_date + 1)::text || ' 06:00:00')::timestamp AT TIME ZONE 'Asia/Hebron';
  v_auth uuid;
  v_branch uuid;
  v_daily_hours numeric := 8;
  v_first timestamptz;
  v_last timestamptz;
  v_session_start timestamptz;
  v_session_end timestamptz;
  v_total_minutes integer := 0;
  v_break_minutes integer := 0;
  v_overlap_minutes integer := 0;
  v_net_minutes integer := 0;
  v_status text := 'present';
  v_manual boolean := false;
  v_manual_first timestamptz;
  v_manual_last timestamptz;
  v_manual_status text;
  v_last_type text;
  v_last_time timestamptz;
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

  IF v_manual THEN
    v_first := v_manual_first;
    v_last := v_manual_last;
    v_status := COALESCE(v_manual_status, 'present');

    SELECT COALESCE(SUM(
             CASE WHEN b.break_in IS NOT NULL AND b.break_in > b.break_out
                  THEN ROUND(EXTRACT(EPOCH FROM (b.break_in - b.break_out))::numeric / 60.0)::integer
                  ELSE 0 END
           ), 0)::integer
      INTO v_break_minutes
      FROM public.attendance_breaks b
     WHERE b.attendance_day_id = (
       SELECT ad.id FROM public.attendance_days ad
        WHERE ad.employee_id = p_employee_id AND ad.attendance_date = p_date
     );

    IF v_first IS NOT NULL AND v_last IS NOT NULL AND v_last > v_first THEN
      v_total_minutes := ROUND(EXTRACT(EPOCH FROM (v_last - v_first))::numeric / 60.0)::integer;
    ELSE
      v_total_minutes := 0;
    END IF;
    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);
  ELSE
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
        IF v_session_start IS NULL THEN v_session_start := r.event_time; END IF;
      ELSIF r.event_type = 'check_out' AND v_session_start IS NOT NULL AND r.event_time > v_session_start THEN
        v_session_end := r.event_time;
        v_total_minutes := v_total_minutes
          + ROUND(EXTRACT(EPOCH FROM (v_session_end - v_session_start))::numeric / 60.0)::integer;

        SELECT COALESCE(SUM(
                 ROUND(EXTRACT(EPOCH FROM (
                   LEAST(b.break_in, v_session_end) - GREATEST(b.break_out, v_session_start)
                 ))::numeric / 60.0)::integer
               ), 0)::integer
          INTO v_overlap_minutes
          FROM public.attendance_breaks b
         WHERE b.employee_id = p_employee_id
           AND b.break_in IS NOT NULL
           AND b.break_in > b.break_out
           AND b.break_out < v_session_end
           AND b.break_in > v_session_start;

        v_break_minutes := v_break_minutes + GREATEST(0, v_overlap_minutes);
        v_last := v_session_end;
        v_session_start := NULL;
      END IF;
    END LOOP;

    v_net_minutes := GREATEST(0, v_total_minutes - v_break_minutes);
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

  IF NOT v_manual AND v_first IS NULL AND v_last IS NULL THEN
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
    is_manually_adjusted = EXCLUDED.is_manually_adjusted,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_update_attendance_day(
  p_day_id uuid,
  p_first_check_in timestamptz,
  p_last_check_out timestamptz,
  p_status text,
  p_notes text,
  p_reason text,
  p_breaks jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day public.attendance_days%ROWTYPE;
  v_owner_id uuid;
  v_break jsonb;
  v_break_out timestamptz;
  v_break_in timestamptz;
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
  IF (p_first_check_in IS NULL) <> (p_last_check_out IS NULL) THEN
    RAISE EXCEPTION 'يجب إدخال وقتي الدخول والخروج معاً أو تركهما فارغين لتصفير الساعات';
  END IF;
  IF p_first_check_in IS NOT NULL AND p_last_check_out <= p_first_check_in THEN
    RAISE EXCEPTION 'وقت الخروج يجب أن يكون بعد وقت الدخول';
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
         status = p_status,
         notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
         is_manually_adjusted = true,
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
    IF p_first_check_in IS NULL OR v_break_out < p_first_check_in OR v_break_in > p_last_check_out THEN
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
      'status', p_status,
      'notes', p_notes,
      'breaks', COALESCE(p_breaks, '[]'::jsonb)
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
$$;

REVOKE ALL ON FUNCTION public.hr_update_attendance_day(uuid,timestamptz,timestamptz,text,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_update_attendance_day(uuid,timestamptz,timestamptz,text,text,text,jsonb) TO authenticated, service_role;

UPDATE public.attendance_breaks
   SET duration_minutes = CASE
     WHEN break_in IS NOT NULL AND break_in > break_out
       THEN ROUND(EXTRACT(EPOCH FROM (break_in - break_out))::numeric / 60.0)::integer
     ELSE NULL
   END
 WHERE duration_minutes IS DISTINCT FROM CASE
     WHEN break_in IS NOT NULL AND break_in > break_out
       THEN ROUND(EXTRACT(EPOCH FROM (break_in - break_out))::numeric / 60.0)::integer
     ELSE NULL
   END;