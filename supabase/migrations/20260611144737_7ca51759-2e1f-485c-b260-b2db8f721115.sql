
-- ============================================================
-- 1) AUTO-CLOSE FUNCTION (reusable for cron + manual back-fill)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_open_attendance_sessions(
  p_employee_id uuid DEFAULT NULL,
  p_min_age_hours integer DEFAULT 18,
  p_close_time timestamptz DEFAULT NULL
)
RETURNS TABLE(employee_id uuid, check_in_time timestamptz, close_time timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text := 'إغلاق تلقائي - لم يبصم خروج. يجب مراجعة دائرة الموارد البشرية';
BEGIN
  RETURN QUERY
  WITH open_sessions AS (
    SELECT DISTINCT ON (ae.employee_id)
      ae.id,
      ae.employee_id,
      ae.auth_user_id,
      ae.branch_id,
      ae.event_time AS check_in_time
    FROM public.attendance_events ae
    WHERE ae.event_type = 'check_in'
      AND (p_employee_id IS NULL OR ae.employee_id = p_employee_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.attendance_events ae2
        WHERE ae2.employee_id = ae.employee_id
          AND ae2.event_time > ae.event_time
      )
      AND ae.event_time < now() - (p_min_age_hours || ' hours')::interval
  ),
  inserted AS (
    INSERT INTO public.attendance_events
      (employee_id, auth_user_id, branch_id, event_type, event_time, status, notes)
    SELECT
      os.employee_id,
      os.auth_user_id,
      os.branch_id,
      'check_out',
      COALESCE(p_close_time, os.check_in_time + interval '10 hours'),
      'manual',
      v_note
    FROM open_sessions os
    RETURNING attendance_events.employee_id, attendance_events.event_time
  )
  SELECT os.employee_id, os.check_in_time, i.event_time
  FROM inserted i
  JOIN open_sessions os ON os.employee_id = i.employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_close_open_attendance_sessions(uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_close_open_attendance_sessions(uuid, integer, timestamptz) TO service_role;

-- ============================================================
-- 2) IMMEDIATE FIX for Huzaifa Ghazal — 3 missing check-outs
--    10/06 close at 17:07 Asia/Hebron (= 14:07 UTC)
--    14/05 + 15/05 orphans: same approach, close at 17:07 local of that day
-- ============================================================
DO $$
DECLARE
  v_emp uuid := '88640ff4-4a06-4c5d-9f1f-337124661351';
  v_auth uuid;
  v_branch_old uuid := 'f82642e1-ce32-456e-8ef8-e556d8d65af9';
  v_branch_new uuid := '6296a204-7c0a-419f-9904-ec11889e012f';
  v_note text := 'إغلاق تلقائي - لم يبصم خروج. يجب مراجعة دائرة الموارد البشرية';
BEGIN
  SELECT user_id INTO v_auth FROM public.employees WHERE id = v_emp;

  -- 10/06/2026  -> close at 17:07 local (14:07 UTC)
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_events
    WHERE employee_id = v_emp
      AND event_type = 'check_out'
      AND event_time::date = DATE '2026-06-10'
  ) THEN
    INSERT INTO public.attendance_events
      (employee_id, auth_user_id, branch_id, event_type, event_time, status, notes)
    VALUES
      (v_emp, v_auth, v_branch_new, 'check_out', '2026-06-10 14:07:00+00', 'manual',
       'تم تسجيل خروج يدوي بناءً على إفادة الموظف — الساعة 5:07م');
  END IF;

  -- 14/05/2026 orphan -> close at 17:07 local (14:07 UTC)
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_events
    WHERE employee_id = v_emp
      AND event_type = 'check_out'
      AND event_time::date = DATE '2026-05-14'
  ) THEN
    INSERT INTO public.attendance_events
      (employee_id, auth_user_id, branch_id, event_type, event_time, status, notes)
    VALUES
      (v_emp, v_auth, v_branch_old, 'check_out', '2026-05-14 17:00:00+00', 'manual', v_note);
  END IF;

  -- 15/05/2026 orphan -> close at 17:00 local
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance_events
    WHERE employee_id = v_emp
      AND event_type = 'check_out'
      AND event_time::date = DATE '2026-05-15'
  ) THEN
    INSERT INTO public.attendance_events
      (employee_id, auth_user_id, branch_id, event_type, event_time, status, notes)
    VALUES
      (v_emp, v_auth, v_branch_old, 'check_out', '2026-05-15 17:00:00+00', 'manual', v_note);
  END IF;
END $$;

-- ============================================================
-- 3) DAILY CRON: 06:05 Asia/Hebron = 03:05 UTC
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior schedule with the same name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-close-open-attendance');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto-close-open-attendance',
  '5 3 * * *',
  $cron$ SELECT public.auto_close_open_attendance_sessions(NULL, 18, NULL); $cron$
);
