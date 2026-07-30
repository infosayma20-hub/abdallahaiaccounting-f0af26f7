-- 1) Dismiss all pending pre-cutoff conflicts (no balance impact; original leaves untouched)
UPDATE public.leave_day_reversals
SET status = 'dismissed',
    reversal_days = 0,
    reason = COALESCE(NULLIF(reason,''), '') || CASE WHEN COALESCE(reason,'') = '' THEN '' ELSE ' · ' END
             || 'فترة سابقة لبدء العمل على النظام (قبل 2026-07-01) — أُلغي التعارض',
    reviewed_at = now(),
    updated_at = now()
WHERE status = 'pending_review'
  AND reversal_date < DATE '2026-07-01';

-- 2) Remove stale HR notifications for those pre-cutoff conflicts
DELETE FROM public.admin_notifications
WHERE event_type = 'leave_attendance_conflict'
  AND (metadata->>'date')::date < DATE '2026-07-01';

-- 3) Detection guard: never create conflicts before the system go-live date
CREATE OR REPLACE FUNCTION public.record_leave_attendance_conflict(_leave_id uuid, _date date, _hours numeric, _attendance_day_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_leave       public.employee_leaves%ROWTYPE;
  v_days        numeric;
  v_status      text;
  v_reason      text;
  v_emp_name    text;
  v_is_holiday  boolean;
BEGIN
  -- الفترة السابقة لبدء العمل على النظام لا تُحتسب
  IF _date < DATE '2026-07-01' THEN RETURN; END IF;

  SELECT * INTO v_leave FROM public.employee_leaves WHERE id = _leave_id;
  IF NOT FOUND OR v_leave.status <> 'approved' THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.official_holidays h
    WHERE h.user_id = v_leave.user_id
      AND h.is_active
      AND h.holiday_date = _date
  ) INTO v_is_holiday;
  IF v_is_holiday THEN RETURN; END IF;

  IF _hours >= 4 THEN
    v_days := 1; v_status := 'pending_review'; v_reason := NULL;
  ELSIF _hours >= 1 THEN
    v_days := 0.5; v_status := 'pending_review'; v_reason := 'دوام جزئي أقل من 4 ساعات';
  ELSE
    v_days := 0; v_status := 'dismissed'; v_reason := 'بصمة قصيرة أقل من ساعة — تم التجاهل تلقائياً';
  END IF;

  INSERT INTO public.leave_day_reversals (
    user_id, employee_id, leave_id, leave_type, reversal_date,
    detected_hours, reversal_days, attendance_day_id, status, detection_source, reason
  ) VALUES (
    v_leave.user_id, v_leave.employee_id, v_leave.id, v_leave.leave_type, _date,
    ROUND(COALESCE(_hours,0)::numeric, 2), v_days, _attendance_day_id, v_status, 'auto', v_reason
  )
  ON CONFLICT (leave_id, reversal_date) DO UPDATE
    SET detected_hours    = EXCLUDED.detected_hours,
        reversal_days     = EXCLUDED.reversal_days,
        attendance_day_id = EXCLUDED.attendance_day_id,
        status            = EXCLUDED.status,
        reason            = EXCLUDED.reason,
        updated_at        = now()
    WHERE public.leave_day_reversals.status = 'pending_review';

  IF v_status = 'pending_review' THEN
    SELECT full_name INTO v_emp_name FROM public.employees WHERE id = v_leave.employee_id;
    INSERT INTO public.admin_notifications (event_type, user_id, user_email, user_name, metadata)
    VALUES (
      'leave_attendance_conflict',
      v_leave.user_id,
      COALESCE(v_emp_name, 'employee'),
      v_emp_name,
      jsonb_build_object(
        'leave_id', v_leave.id,
        'employee_id', v_leave.employee_id,
        'employee_name', v_emp_name,
        'date', _date,
        'leave_type', v_leave.leave_type,
        'hours', ROUND(COALESCE(_hours,0)::numeric, 2),
        'reversal_days', v_days
      )
    );
  END IF;
END;
$function$;