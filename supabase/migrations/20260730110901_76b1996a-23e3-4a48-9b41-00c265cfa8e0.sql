-- ═══════════════════════════════════════════════════════════════
-- 1) جدول استرجاع أيام الإجازة (Clawback ledger)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.leave_day_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_id uuid NOT NULL REFERENCES public.employee_leaves(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  reversal_date date NOT NULL,
  detected_hours numeric NOT NULL DEFAULT 0,
  reversal_days numeric NOT NULL DEFAULT 1,
  attendance_day_id uuid,
  status text NOT NULL DEFAULT 'pending_review',
  detection_source text NOT NULL DEFAULT 'auto',
  reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_day_reversals_status_check
    CHECK (status = ANY (ARRAY['pending_review','confirmed','dismissed'])),
  CONSTRAINT leave_day_reversals_days_check
    CHECK (reversal_days >= 0 AND reversal_days <= 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_day_reversals TO authenticated;
GRANT ALL ON public.leave_day_reversals TO service_role;

ALTER TABLE public.leave_day_reversals ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS leave_day_reversals_unique
  ON public.leave_day_reversals (leave_id, reversal_date);
CREATE INDEX IF NOT EXISTS idx_ldr_employee ON public.leave_day_reversals (employee_id, reversal_date);
CREATE INDEX IF NOT EXISTS idx_ldr_user_status ON public.leave_day_reversals (user_id, status);

CREATE POLICY "Team can view leave reversals" ON public.leave_day_reversals
  FOR SELECT TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "Employees can view their own leave reversals" ON public.leave_day_reversals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = leave_day_reversals.employee_id
      AND e.auth_user_id = (SELECT auth.uid())
  ));

CREATE POLICY "Team can insert leave reversals" ON public.leave_day_reversals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id)
              AND public.user_can_access((SELECT auth.uid()), 'hr'));

CREATE POLICY "Team can update leave reversals" ON public.leave_day_reversals
  FOR UPDATE TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id)
         AND public.user_can_access((SELECT auth.uid()), 'hr'));

CREATE POLICY "Admins can delete leave reversals" ON public.leave_day_reversals
  FOR DELETE TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id)
         AND (public.has_role((SELECT auth.uid()), 'admin')
              OR public.has_role((SELECT auth.uid()), 'super_admin')
              OR public.has_role((SELECT auth.uid()), 'hr_manager')));

CREATE TRIGGER trg_ldr_updated_at
  BEFORE UPDATE ON public.leave_day_reversals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 2) حقول استثناء الرصيد غير الكافي على طلب الإجازة
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.employee_leaves
  ADD COLUMN IF NOT EXISTS balance_exception boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_exception_reason text,
  ADD COLUMN IF NOT EXISTS balance_exception_by uuid,
  ADD COLUMN IF NOT EXISTS balance_exception_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_shortfall_days numeric;

-- ═══════════════════════════════════════════════════════════════
-- 3) توسيع أنواع الإشعارات الإدارية
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.admin_notifications
  DROP CONSTRAINT IF EXISTS admin_notifications_event_type_check;
ALTER TABLE public.admin_notifications
  ADD CONSTRAINT admin_notifications_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'signup','email_verified','first_login',
    'leave_attendance_conflict','leave_balance_exception'
  ]));

-- ═══════════════════════════════════════════════════════════════
-- 4) دالة تسجيل تعارض إجازة/دوام ليوم واحد
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_leave_attendance_conflict(
  _leave_id uuid,
  _date date,
  _hours numeric,
  _attendance_day_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leave       public.employee_leaves%ROWTYPE;
  v_days        numeric;
  v_status      text;
  v_reason      text;
  v_emp_name    text;
  v_is_holiday  boolean;
BEGIN
  SELECT * INTO v_leave FROM public.employee_leaves WHERE id = _leave_id;
  IF NOT FOUND OR v_leave.status <> 'approved' THEN RETURN; END IF;

  -- استثناء العطل الرسمية
  SELECT EXISTS (
    SELECT 1 FROM public.official_holidays h
    WHERE h.user_id = v_leave.user_id
      AND h.is_active
      AND h.holiday_date = _date
  ) INTO v_is_holiday;
  IF v_is_holiday THEN RETURN; END IF;

  -- عتبات الكشف
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

  -- إشعار الموارد البشرية (للحالات التي تحتاج مراجعة فقط)
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
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5) تريغر على سجل الدوام اليومي
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.detect_leave_conflict_from_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours numeric;
  v_leave record;
BEGIN
  IF NEW.status NOT IN ('present','late','incomplete') THEN RETURN NEW; END IF;

  v_hours := COALESCE(NEW.net_work_minutes::numeric / 60.0, NEW.total_hours, 0);

  FOR v_leave IN
    SELECT id FROM public.employee_leaves
    WHERE employee_id = NEW.employee_id
      AND status = 'approved'
      AND NEW.attendance_date BETWEEN start_date AND end_date
  LOOP
    PERFORM public.record_leave_attendance_conflict(v_leave.id, NEW.attendance_date, v_hours, NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_leave_conflict_attendance ON public.attendance_days;
CREATE TRIGGER trg_detect_leave_conflict_attendance
  AFTER INSERT OR UPDATE OF status, total_hours, net_work_minutes
  ON public.attendance_days
  FOR EACH ROW EXECUTE FUNCTION public.detect_leave_conflict_from_attendance();

-- ═══════════════════════════════════════════════════════════════
-- 6) تريغر على اعتماد الإجازة (كشف بأثر رجعي)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.detect_leave_conflict_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day record;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved'
     AND OLD.start_date = NEW.start_date AND OLD.end_date = NEW.end_date THEN
    RETURN NEW;
  END IF;

  FOR v_day IN
    SELECT id, attendance_date,
           COALESCE(net_work_minutes::numeric / 60.0, total_hours, 0) AS hours
    FROM public.attendance_days
    WHERE employee_id = NEW.employee_id
      AND status IN ('present','late','incomplete')
      AND attendance_date BETWEEN NEW.start_date AND NEW.end_date
  LOOP
    PERFORM public.record_leave_attendance_conflict(NEW.id, v_day.attendance_date, v_day.hours, v_day.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_leave_conflict_approval ON public.employee_leaves;
CREATE TRIGGER trg_detect_leave_conflict_approval
  AFTER INSERT OR UPDATE OF status, start_date, end_date
  ON public.employee_leaves
  FOR EACH ROW EXECUTE FUNCTION public.detect_leave_conflict_on_approval();

-- ═══════════════════════════════════════════════════════════════
-- 7) تأكيد / تجاهل الاسترجاع (مع احترام أقفال الحضور)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.review_leave_day_reversal(
  _reversal_id uuid,
  _action text,          -- 'confirm' | 'dismiss'
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.leave_day_reversals%ROWTYPE;
  v_owner uuid;
  v_locked boolean;
  v_remaining numeric;
BEGIN
  SELECT * INTO r FROM public.leave_day_reversals WHERE id = _reversal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'سجل الاسترجاع غير موجود'; END IF;

  -- تحقق الصلاحية والعزل بين الشركات
  IF NOT (public.is_team_member(auth.uid(), r.user_id)
          AND public.user_can_access(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'غير مصرح لك بمراجعة استرجاع الإجازات';
  END IF;

  IF _action NOT IN ('confirm','dismiss') THEN
    RAISE EXCEPTION 'إجراء غير معروف';
  END IF;

  IF _action = 'dismiss' THEN
    UPDATE public.leave_day_reversals
      SET status = 'dismissed', reason = COALESCE(_reason, reason),
          reviewed_by = auth.uid(), reviewed_at = now()
      WHERE id = _reversal_id;
    RETURN jsonb_build_object('ok', true, 'status', 'dismissed');
  END IF;

  -- تأكيد: يُمنع على الأيام المقفلة
  SELECT EXISTS (
    SELECT 1 FROM public.hr_attendance_locks l
    WHERE l.auth_user_id = r.user_id
      AND l.attendance_date = r.reversal_date
      AND l.status = 'locked'
  ) INTO v_locked;
  IF v_locked THEN
    RAISE EXCEPTION 'اليوم % مقفل من قِبل الموارد البشرية — يتطلب فك القفل أو تسوية بالشهر الجاري', r.reversal_date;
  END IF;

  UPDATE public.leave_day_reversals
    SET status = 'confirmed', reason = COALESCE(_reason, reason),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _reversal_id;

  -- تصحيح حالة اليوم في سجل الدوام (اليوم صار دواماً فعلياً لا إجازة)
  UPDATE public.attendance_days
    SET status = CASE WHEN status = 'leave' THEN 'present' ELSE status END,
        notes = COALESCE(notes || ' | ', '') || 'تم استرجاع يوم إجازة (' || r.leave_type || ') بعد إثبات الدوام',
        updated_at = now()
    WHERE employee_id = r.employee_id AND attendance_date = r.reversal_date;

  -- إذا استُرجعت كل أيام الإجازة → تُلغى بالكامل مع توثيق السبب
  SELECT l.days_count - COALESCE((
      SELECT SUM(x.reversal_days) FROM public.leave_day_reversals x
      WHERE x.leave_id = l.id AND x.status = 'confirmed'), 0)
    INTO v_remaining
    FROM public.employee_leaves l WHERE l.id = r.leave_id;

  IF v_remaining IS NOT NULL AND v_remaining <= 0 THEN
    UPDATE public.employee_leaves
      SET status = 'cancelled',
          review_notes = COALESCE(review_notes || ' | ', '')
            || 'أُلغيت تلقائياً: الموظف داوم في كامل أيام الإجازة',
          updated_at = now()
      WHERE id = r.leave_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed', 'remaining_days', v_remaining);
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_leave_day_reversal(uuid, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 8) تعبئة تاريخية (بانتظار المراجعة فقط — بدون أي أثر مالي)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.leave_day_reversals (
  user_id, employee_id, leave_id, leave_type, reversal_date,
  detected_hours, reversal_days, attendance_day_id, status, detection_source, reason
)
SELECT
  l.user_id, l.employee_id, l.id, l.leave_type, d.attendance_date,
  ROUND(COALESCE(d.net_work_minutes::numeric / 60.0, d.total_hours, 0)::numeric, 2),
  CASE
    WHEN COALESCE(d.net_work_minutes::numeric / 60.0, d.total_hours, 0) >= 4 THEN 1
    WHEN COALESCE(d.net_work_minutes::numeric / 60.0, d.total_hours, 0) >= 1 THEN 0.5
    ELSE 0
  END,
  d.id,
  CASE
    WHEN COALESCE(d.net_work_minutes::numeric / 60.0, d.total_hours, 0) >= 1 THEN 'pending_review'
    ELSE 'dismissed'
  END,
  'backfill',
  CASE
    WHEN COALESCE(d.net_work_minutes::numeric / 60.0, d.total_hours, 0) < 1
      THEN 'بصمة قصيرة أقل من ساعة — تم التجاهل تلقائياً'
    ELSE NULL
  END
FROM public.employee_leaves l
JOIN public.attendance_days d
  ON d.employee_id = l.employee_id
 AND d.attendance_date BETWEEN l.start_date AND l.end_date
WHERE l.status = 'approved'
  AND d.status IN ('present','late','incomplete')
  AND NOT EXISTS (
    SELECT 1 FROM public.official_holidays h
    WHERE h.user_id = l.user_id AND h.is_active AND h.holiday_date = d.attendance_date
  )
ON CONFLICT (leave_id, reversal_date) DO NOTHING;