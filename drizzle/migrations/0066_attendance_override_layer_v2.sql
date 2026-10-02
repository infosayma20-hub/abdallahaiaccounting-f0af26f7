-- طبقة تصحيحات الموارد البشرية فوق البصمات الأصلية (لا تُعدَّل البصمات أبدًا)
CREATE TABLE IF NOT EXISTS public.attendance_day_overrides (
  attendance_day_id uuid PRIMARY KEY REFERENCES public.attendance_days(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  override_in timestamptz,
  override_out timestamptz,
  status_lock text CHECK (status_lock IN ('leave','absent','holiday')),
  ignored_event_ids uuid[] NOT NULL DEFAULT '{}',
  leave_id uuid,
  reason text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.attendance_day_overrides TO authenticated;
GRANT ALL ON public.attendance_day_overrides TO service_role;

ALTER TABLE public.attendance_day_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can read attendance overrides"
ON public.attendance_day_overrides
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = attendance_day_overrides.employee_id
       AND (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
         OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
       AND public.is_team_member(auth.uid(), e.user_id)
  )
);

COMMENT ON TABLE public.attendance_day_overrides IS
  'HR corrections layered over raw attendance_events. recompute_attendance_day applies them; written only via hr_save_attendance_day.';

CREATE OR REPLACE FUNCTION public._attendance_effective_events(
  p_employee_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_apply boolean,
  p_in timestamptz,
  p_out timestamptz,
  p_ignored uuid[]
)
RETURNS TABLE(event_type text, event_time timestamptz, auth_user_id uuid, branch_id uuid, checkout_kind text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT ae.id, ae.event_type, ae.event_time, ae.created_at, ae.auth_user_id, ae.branch_id, ae.checkout_kind
      FROM public.attendance_events ae
     WHERE ae.employee_id = p_employee_id
       AND ae.status IN ('valid', 'manual')
       AND ae.event_time >= p_start
       AND ae.event_time < CASE WHEN p_apply AND p_out IS NOT NULL AND p_out >= p_end
                                THEN p_out + interval '1 second' ELSE p_end END
       AND (NOT p_apply OR NOT (ae.id = ANY (COALESCE(p_ignored, '{}'::uuid[]))))
  ),
  after_in AS (
    SELECT b.* FROM base b
     WHERE NOT p_apply OR p_in IS NULL OR b.event_time >= p_in
  ),
  first_ev AS (
    SELECT a.id, a.event_type FROM after_in a ORDER BY a.event_time, a.created_at LIMIT 1
  ),
  adj AS (
    SELECT a.id, a.event_type, a.event_time, a.created_at, a.auth_user_id, a.branch_id, a.checkout_kind
      FROM after_in a
     WHERE NOT p_apply OR p_in IS NULL
        OR a.id IS DISTINCT FROM (SELECT f.id FROM first_ev f WHERE f.event_type = 'check_in')
    UNION ALL
    SELECT NULL::uuid, 'check_in'::text, p_in, p_in, NULL::uuid, NULL::uuid, NULL::text
     WHERE p_apply AND p_in IS NOT NULL
  ),
  s AS (
    SELECT MAX(a.event_time) AS t FROM adj a
     WHERE a.event_type = 'check_in' AND p_out IS NOT NULL AND a.event_time < p_out
  ),
  fin AS (
    SELECT a.* FROM adj a
     WHERE NOT p_apply OR p_out IS NULL
        OR NOT (a.event_type = 'check_out'
                AND a.event_time > COALESCE((SELECT s.t FROM s), '-infinity'::timestamptz)
                AND a.event_time <= p_out)
    UNION ALL
    SELECT NULL::uuid, 'check_out'::text, p_out, p_out, NULL::uuid, NULL::uuid, NULL::text
     WHERE p_apply AND p_out IS NOT NULL
  )
  SELECT f.event_type, f.event_time, f.auth_user_id, f.branch_id, f.checkout_kind
    FROM fin f
   ORDER BY f.event_time, f.created_at;
$function$;

REVOKE ALL ON FUNCTION public._attendance_effective_events(uuid, timestamptz, timestamptz, boolean, timestamptz, timestamptz, uuid[]) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE s text;
BEGIN
  s := pg_get_functiondef('public.recompute_attendance_day(uuid,date)'::regprocedure);
  IF position($q$  r record;
BEGIN$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$  r record;
BEGIN$q$, $q$  r record;
  v_ov public.attendance_day_overrides%ROWTYPE;
  v_has_ov boolean := false;
  v_biz_today date := ((now() AT TIME ZONE v_tz) - ((v_rules->>'business_day_start') || ':00')::interval)::date;
BEGIN$q$);
  IF position($q$  -- تعديل جزئي:$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$  -- تعديل جزئي:$q$, $q$  -- طبقة تصحيحات الموارد (v2): البصمات الأصلية + تصحيحات = حساب واحد
  IF v_day_id IS NOT NULL THEN
    SELECT o.* INTO v_ov FROM public.attendance_day_overrides o WHERE o.attendance_day_id = v_day_id;
    v_has_ov := FOUND;
  END IF;
  IF v_has_ov AND v_ov.status_lock IS NOT NULL THEN
    UPDATE public.attendance_days
       SET first_check_in = NULL, last_check_out = NULL,
           total_hours = 0, overtime_hours = 0,
           status = v_ov.status_lock,
           total_break_minutes = 0, net_work_minutes = 0,
           is_manually_adjusted = true, updated_at = now()
     WHERE id = v_day_id;
    RETURN;
  END IF;
  IF v_has_ov THEN
    v_manual := false;
  END IF;

  -- تعديل جزئي:$q$);
  IF position($q$      SELECT ae.event_type, ae.event_time, ae.auth_user_id, ae.branch_id, ae.checkout_kind
        FROM public.attendance_events ae
       WHERE ae.employee_id = p_employee_id
         AND ae.event_time >= v_start
         AND ae.event_time < v_end
         AND ae.status IN ('valid', 'manual')
       ORDER BY ae.event_time, ae.created_at$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$      SELECT ae.event_type, ae.event_time, ae.auth_user_id, ae.branch_id, ae.checkout_kind
        FROM public.attendance_events ae
       WHERE ae.employee_id = p_employee_id
         AND ae.event_time >= v_start
         AND ae.event_time < v_end
         AND ae.status IN ('valid', 'manual')
       ORDER BY ae.event_time, ae.created_at$q$, $q$      SELECT ee.event_type, ee.event_time, ee.auth_user_id, ee.branch_id, ee.checkout_kind
        FROM public._attendance_effective_events(
          p_employee_id, v_start, v_end, v_has_ov,
          v_ov.override_in, v_ov.override_out, v_ov.ignored_event_ids) ee$q$);
  IF position($q$    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE v_tz)) >= 9 THEN
      v_status := 'late';
    END IF;
  END IF;$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE v_tz)) >= 9 THEN
      v_status := 'late';
    END IF;
  END IF;$q$, $q$    IF v_first IS NOT NULL AND EXTRACT(HOUR FROM (v_first AT TIME ZONE v_tz)) >= 9 THEN
      v_status := 'late';
    END IF;
    -- يوم مُصحَّح انتهى ولم تُغلق أي جلسة فيه = بصمة ناقصة
    IF v_has_ov AND v_first IS NOT NULL AND v_last IS NULL AND p_date < v_biz_today THEN
      v_status := 'incomplete';
    END IF;
  END IF;$q$);
  IF position($q$  IF NOT v_manual AND v_first IS NULL THEN$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$  IF NOT v_manual AND v_first IS NULL THEN$q$, $q$  IF NOT v_manual AND NOT v_has_ov AND v_first IS NULL THEN$q$);
  IF position($q$    v_status, v_all_break_minutes, v_net_minutes, v_manual
$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$    v_status, v_all_break_minutes, v_net_minutes, v_manual
$q$, $q$    v_status, v_all_break_minutes, v_net_minutes, (v_manual OR v_has_ov)
$q$);
  EXECUTE s;
END
$patch$;

DO $patch$
DECLARE s text;
BEGIN
  s := pg_get_functiondef('public.hr_update_attendance_day(uuid,timestamptz,timestamptz,text,text,text,jsonb,jsonb)'::regprocedure);
  IF position($q$  PERFORM public.recompute_attendance_day(v_day.employee_id, v_day.attendance_date);$q$ IN s) = 0 THEN RAISE EXCEPTION 'patch anchor missing'; END IF;
  s := replace(s, $q$  PERFORM public.recompute_attendance_day(v_day.employee_id, v_day.attendance_date);$q$, $q$  -- المسار القديم: يلغي طبقة التصحيحات حتى لا تتعارض القيم
  DELETE FROM public.attendance_day_overrides WHERE attendance_day_id = p_day_id;
  PERFORM public.recompute_attendance_day(v_day.employee_id, v_day.attendance_date);$q$);
  EXECUTE s;
END
$patch$;

CREATE OR REPLACE FUNCTION public.hr_save_attendance_day(
  p_day_id uuid,
  p_employee_id uuid,
  p_date date,
  p_first_check_in timestamptz,
  p_last_check_out timestamptz,
  p_status text,
  p_notes text,
  p_reason text,
  p_breaks jsonb DEFAULT '[]'::jsonb,
  p_deleted_break_ids uuid[] DEFAULT '{}'::uuid[],
  p_dismissed_gaps jsonb DEFAULT '[]'::jsonb,
  p_ignored_event_ids uuid[] DEFAULT '{}'::uuid[],
  p_leave_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rules jsonb := public.attendance_departure_rules();
  v_tz text := v_rules->>'timezone';
  v_tol integer := (v_rules->>'dismissal_tolerance_seconds')::int;
  v_day public.attendance_days%ROWTYPE;
  v_emp record;
  v_old_ov public.attendance_day_overrides%ROWTYPE;
  v_had_ov boolean := false;
  v_lock text;
  v_leave_id uuid;
  v_break jsonb;
  v_bid uuid;
  v_bo timestamptz;
  v_bi timestamptz;
  v_btype text;
  v_gap jsonb;
  v_go timestamptz;
  v_gi timestamptz;
  v_after integer := 0;
  v_final record;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN RAISE EXCEPTION 'سبب التعديل إلزامي'; END IF;
  IF p_status NOT IN ('present','absent','late','incomplete','leave','holiday') THEN
    RAISE EXCEPTION 'حالة الحضور غير صالحة';
  END IF;
  IF jsonb_typeof(COALESCE(p_breaks, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_dismissed_gaps, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'بيانات الجلسات غير صالحة';
  END IF;

  v_lock := CASE WHEN p_status IN ('leave','absent','holiday') THEN p_status END;

  IF v_lock IS NULL AND p_first_check_in IS NOT NULL AND p_last_check_out IS NOT NULL
     AND p_last_check_out <= p_first_check_in THEN
    RAISE EXCEPTION 'وقت الخروج يجب أن يكون بعد وقت الدخول';
  END IF;

  IF p_day_id IS NOT NULL THEN
    SELECT ad.* INTO v_day FROM public.attendance_days ad WHERE ad.id = p_day_id FOR UPDATE;
  ELSIF p_employee_id IS NOT NULL AND p_date IS NOT NULL THEN
    SELECT ad.* INTO v_day FROM public.attendance_days ad
     WHERE ad.employee_id = p_employee_id AND ad.attendance_date = p_date FOR UPDATE;
  END IF;

  SELECT e.id, e.user_id, e.auth_user_id, e.branch_id INTO v_emp
    FROM public.employees e
   WHERE e.id = COALESCE(v_day.employee_id, p_employee_id);
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'الموظف غير موجود'; END IF;

  IF NOT (
    (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
    AND public.is_team_member(auth.uid(), v_emp.user_id)
  ) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل حضور هذا الموظف';
  END IF;

  IF v_day.id IS NULL THEN
    IF p_date IS NULL THEN RAISE EXCEPTION 'سجل الحضور غير موجود'; END IF;
    INSERT INTO public.attendance_days (
      employee_id, auth_user_id, branch_id, attendance_date, status, is_manually_adjusted
    ) VALUES (
      v_emp.id, COALESCE(v_emp.auth_user_id, v_emp.user_id), v_emp.branch_id, p_date,
      COALESCE(v_lock, 'absent'), true
    ) RETURNING * INTO v_day;
  END IF;

  SELECT o.* INTO v_old_ov FROM public.attendance_day_overrides o WHERE o.attendance_day_id = v_day.id;
  v_had_ov := FOUND;
  v_leave_id := v_old_ov.leave_id;

  INSERT INTO public.attendance_day_overrides AS o (
    attendance_day_id, employee_id, override_in, override_out, status_lock,
    ignored_event_ids, leave_id, reason, updated_by, updated_at
  ) VALUES (
    v_day.id, v_emp.id,
    CASE WHEN v_lock IS NULL THEN p_first_check_in END,
    CASE WHEN v_lock IS NULL THEN p_last_check_out END,
    v_lock, COALESCE(p_ignored_event_ids, '{}'::uuid[]), v_leave_id,
    btrim(p_reason), auth.uid(), now()
  )
  ON CONFLICT (attendance_day_id) DO UPDATE SET
    override_in = EXCLUDED.override_in,
    override_out = EXCLUDED.override_out,
    status_lock = EXCLUDED.status_lock,
    ignored_event_ids = EXCLUDED.ignored_event_ids,
    reason = EXCLUDED.reason,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  UPDATE public.attendance_days
     SET notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
         is_manually_adjusted = true,
         manual_check_out_set = true,
         updated_at = now()
   WHERE id = v_day.id;

  IF v_lock IS NULL THEN
    DELETE FROM public.attendance_breaks
     WHERE attendance_day_id = v_day.id
       AND id = ANY (COALESCE(p_deleted_break_ids, '{}'::uuid[]));

    FOR v_break IN SELECT value FROM jsonb_array_elements(COALESCE(p_breaks, '[]'::jsonb))
    LOOP
      v_bid := NULLIF(v_break->>'id', '')::uuid;
      v_bo := NULLIF(v_break->>'break_out', '')::timestamptz;
      v_bi := NULLIF(v_break->>'break_in', '')::timestamptz;
      v_btype := CASE WHEN v_break->>'break_type' IN ('prayer','personal','meal','external_task','other','rest')
                      THEN v_break->>'break_type' ELSE 'other' END;
      IF v_bo IS NULL OR (v_bi IS NOT NULL AND v_bi <= v_bo) THEN
        RAISE EXCEPTION 'وقت جلسة الخروج والعودة غير صالح';
      END IF;
      IF v_bi IS NULL AND v_bid IS NULL THEN
        RAISE EXCEPTION 'الجلسة الجديدة تحتاج وقت خروج وعودة';
      END IF;
      IF (p_first_check_in IS NOT NULL AND v_bo < p_first_check_in)
         OR (p_last_check_out IS NOT NULL AND v_bi IS NOT NULL AND v_bi > p_last_check_out) THEN
        RAISE EXCEPTION 'الجلسة يجب أن تكون داخل وقت الدوام المعدل';
      END IF;

      IF v_bid IS NOT NULL THEN
        UPDATE public.attendance_breaks
           SET break_out = v_bo, break_in = v_bi, break_type = v_btype,
               reason = COALESCE(NULLIF(btrim(v_break->>'reason'), ''), reason)
         WHERE id = v_bid AND attendance_day_id = v_day.id
           AND (break_out IS DISTINCT FROM v_bo OR break_in IS DISTINCT FROM v_bi
                OR break_type IS DISTINCT FROM v_btype);
      ELSE
        INSERT INTO public.attendance_breaks (
          attendance_day_id, employee_id, auth_user_id, branch_id, break_type, break_out, break_in, reason
        ) VALUES (
          v_day.id, v_emp.id, v_day.auth_user_id, v_day.branch_id, v_btype, v_bo, v_bi,
          COALESCE(NULLIF(btrim(v_break->>'reason'), ''), 'تعديل يدوي من الموارد البشرية')
        );
      END IF;
    END LOOP;

    FOR v_gap IN SELECT value FROM jsonb_array_elements(COALESCE(p_dismissed_gaps, '[]'::jsonb))
    LOOP
      v_go := NULLIF(v_gap->>'gap_out', '')::timestamptz;
      v_gi := NULLIF(v_gap->>'gap_in', '')::timestamptz;
      IF v_go IS NULL OR v_gi IS NULL OR v_gi <= v_go THEN
        RAISE EXCEPTION 'وقت المغادرة المستبعدة غير صالح';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.attendance_derived_gap_dismissals dg
         WHERE dg.attendance_day_id = v_day.id
           AND ABS(EXTRACT(EPOCH FROM (dg.gap_out - v_go))) <= v_tol
           AND ABS(EXTRACT(EPOCH FROM (dg.gap_in - v_gi))) <= v_tol
      ) THEN
        INSERT INTO public.attendance_derived_gap_dismissals (
          attendance_day_id, employee_id, gap_out, gap_in, reason, dismissed_by
        ) VALUES (v_day.id, v_emp.id, v_go, v_gi, btrim(p_reason), auth.uid());
      END IF;
    END LOOP;
  END IF;

  PERFORM public.recompute_attendance_day(v_emp.id, v_day.attendance_date);

  IF v_lock = 'leave' THEN
    IF v_leave_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.employee_leaves l
       WHERE l.employee_id = v_emp.id AND l.status = 'approved'
         AND v_day.attendance_date BETWEEN l.start_date AND l.end_date
    ) THEN
      IF p_leave_type IS NULL THEN
        RAISE EXCEPTION 'اختر نوع الإجازة';
      END IF;
      INSERT INTO public.employee_leaves (
        user_id, employee_id, leave_type, start_date, end_date, days_count, status,
        notes, reviewed_at, reviewed_by, review_notes
      ) VALUES (
        v_emp.user_id, v_emp.id, p_leave_type, v_day.attendance_date, v_day.attendance_date, 1, 'approved',
        'من تعديل الحضور: ' || btrim(p_reason), now(), auth.uid(), 'سُجّلت من شاشة الحضور'
      ) RETURNING id INTO v_leave_id;
      UPDATE public.attendance_day_overrides SET leave_id = v_leave_id WHERE attendance_day_id = v_day.id;
    END IF;
  ELSIF v_leave_id IS NOT NULL THEN
    UPDATE public.employee_leaves
       SET status = 'cancelled', review_notes = 'أُلغيت من تعديل الحضور: ' || btrim(p_reason),
           reviewed_at = now(), reviewed_by = auth.uid()
     WHERE id = v_leave_id AND status = 'approved'
       AND start_date = v_day.attendance_date AND end_date = v_day.attendance_date;
    UPDATE public.attendance_day_overrides SET leave_id = NULL WHERE attendance_day_id = v_day.id;
  END IF;

  SELECT ad.first_check_in, ad.last_check_out, ad.status, ad.total_hours, ad.net_work_minutes,
         ad.total_break_minutes, ad.overtime_hours
    INTO v_final FROM public.attendance_days ad WHERE ad.id = v_day.id;

  IF v_lock IS NULL AND p_last_check_out IS NOT NULL THEN
    SELECT count(*) INTO v_after
      FROM public.attendance_events ae
     WHERE ae.employee_id = v_emp.id
       AND ae.status IN ('valid','manual')
       AND ae.event_time > p_last_check_out
       AND ae.event_time < ((v_day.attendance_date + 1)::text || ' ' || (v_rules->>'business_day_start') || ':00')::timestamp AT TIME ZONE v_tz
       AND NOT (ae.id = ANY (COALESCE(p_ignored_event_ids, '{}'::uuid[])));
    IF v_after > 0 THEN
      v_warnings := v_warnings || jsonb_build_object('code','punches_after_out','count',v_after);
    END IF;
  END IF;
  IF v_final.status IS DISTINCT FROM p_status THEN
    v_warnings := v_warnings || jsonb_build_object('code','status_computed','requested',p_status,'final',v_final.status);
  END IF;

  INSERT INTO public.attendance_audit_logs (
    table_name, record_id, action, old_values, new_values, changed_by, reason
  ) VALUES (
    'attendance_days', v_day.id, 'update',
    jsonb_build_object(
      'first_check_in', v_day.first_check_in, 'last_check_out', v_day.last_check_out,
      'status', v_day.status, 'notes', v_day.notes, 'total_hours', v_day.total_hours,
      'overtime_hours', v_day.overtime_hours,
      'override', CASE WHEN v_had_ov THEN to_jsonb(v_old_ov) END
    ),
    jsonb_build_object(
      'first_check_in', v_final.first_check_in, 'last_check_out', v_final.last_check_out,
      'status', v_final.status, 'notes', p_notes, 'total_hours', v_final.total_hours,
      'requested_in', p_first_check_in, 'requested_out', p_last_check_out, 'requested_status', p_status,
      'breaks', COALESCE(p_breaks, '[]'::jsonb), 'deleted_break_ids', to_jsonb(COALESCE(p_deleted_break_ids, '{}'::uuid[])),
      'dismissed_gaps', COALESCE(p_dismissed_gaps, '[]'::jsonb),
      'ignored_event_ids', to_jsonb(COALESCE(p_ignored_event_ids, '{}'::uuid[])),
      'leave_id', v_leave_id, 'engine', 'v2'
    ),
    auth.uid(), btrim(p_reason)
  );

  RETURN jsonb_build_object(
    'id', v_day.id,
    'first_check_in', v_final.first_check_in,
    'last_check_out', v_final.last_check_out,
    'status', v_final.status,
    'total_hours', v_final.total_hours,
    'net_work_minutes', v_final.net_work_minutes,
    'total_break_minutes', v_final.total_break_minutes,
    'overtime_hours', v_final.overtime_hours,
    'leave_id', v_leave_id,
    'warnings', v_warnings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_save_attendance_day(uuid, uuid, date, timestamptz, timestamptz, text, text, text, jsonb, uuid[], jsonb, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_save_attendance_day(uuid, uuid, date, timestamptz, timestamptz, text, text, text, jsonb, uuid[], jsonb, uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_attendance_review_days(p_from date, p_to date)
RETURNS TABLE(
  day_id uuid, employee_id uuid, full_name text, attendance_date date,
  issue text, first_check_in timestamptz, last_check_out timestamptz,
  status text, requested_status text, punches_after integer, last_punch timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scope AS (
    SELECT d.*, e.full_name
      FROM public.attendance_days d
      JOIN public.employees e ON e.id = d.employee_id
     WHERE d.attendance_date BETWEEN p_from AND p_to
       AND d.is_manually_adjusted
       AND NOT EXISTS (SELECT 1 FROM public.attendance_day_overrides o WHERE o.attendance_day_id = d.id)
       AND (public.has_role(auth.uid(), 'hr_manager'::public.app_role)
         OR public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
       AND public.is_team_member(auth.uid(), e.user_id)
  ),
  after_close AS (
    SELECT s.id, count(ae.id)::int AS n, max(ae.event_time) AS lp
      FROM scope s
      JOIN public.attendance_events ae
        ON ae.employee_id = s.employee_id
       AND ae.status IN ('valid','manual')
       AND ae.event_time > s.last_check_out + interval '2 minutes'
       AND ae.event_time < ((s.attendance_date + 1)::timestamp + interval '6 hours') AT TIME ZONE 'Asia/Hebron'
     WHERE s.last_check_out IS NOT NULL AND COALESCE(s.manual_check_out_set, true)
     GROUP BY s.id
  ),
  last_req AS (
    SELECT DISTINCT ON (a.record_id) a.record_id, a.new_values->>'status' AS st
      FROM public.attendance_audit_logs a
     WHERE a.table_name = 'attendance_days'
       AND a.record_id IN (SELECT id FROM scope)
     ORDER BY a.record_id, a.created_at DESC
  )
  SELECT s.id, s.employee_id, s.full_name, s.attendance_date,
         CASE WHEN ac.id IS NOT NULL THEN 'punches_after_out' ELSE 'status_reverted' END,
         s.first_check_in, s.last_check_out, s.status, lr.st, COALESCE(ac.n, 0), ac.lp
    FROM scope s
    LEFT JOIN after_close ac ON ac.id = s.id
    LEFT JOIN last_req lr ON lr.record_id = s.id
   WHERE ac.id IS NOT NULL
      OR (lr.st IN ('leave','absent','holiday') AND s.status IS DISTINCT FROM lr.st)
   ORDER BY s.attendance_date DESC, s.full_name;
$function$;

REVOKE ALL ON FUNCTION public.hr_attendance_review_days(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_attendance_review_days(date, date) TO authenticated;