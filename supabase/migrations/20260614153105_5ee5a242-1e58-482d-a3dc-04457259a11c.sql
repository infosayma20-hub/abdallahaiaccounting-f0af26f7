-- 1) Disable the daily auto-close cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-close-open-attendance') THEN
    PERFORM cron.unschedule('auto-close-open-attendance');
  END IF;
END $$;

-- 2) Drop and recreate the auto-close function as a no-op (keep original param names).
DROP FUNCTION IF EXISTS public.auto_close_open_attendance_sessions(uuid, integer, timestamptz);

CREATE OR REPLACE FUNCTION public.auto_close_open_attendance_sessions(
  p_employee_id uuid DEFAULT NULL,
  p_min_hours_open integer DEFAULT 18,
  p_close_time timestamptz DEFAULT NULL
)
RETURNS TABLE(employee_id uuid, check_in_time timestamptz, close_time timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-stamping check_out on behalf of an employee is DISABLED by policy.
  -- Missing check-outs must remain empty so the employee/HR can submit a correction request.
  RAISE NOTICE 'auto_close_open_attendance_sessions is disabled by policy. Missing check-outs remain empty.';
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_close_open_attendance_sessions(uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_close_open_attendance_sessions(uuid, integer, timestamptz) TO service_role;

-- 3) Revert historical auto-closed check-out events and mark affected days incomplete
WITH deleted AS (
  DELETE FROM public.attendance_events
   WHERE event_type = 'check_out'
     AND notes ILIKE '%إغلاق تلقائي%'
  RETURNING employee_id, (event_time AT TIME ZONE 'Asia/Hebron')::date AS att_date
)
UPDATE public.attendance_days d
   SET last_check_out = NULL,
       total_hours = 0,
       net_work_minutes = 0,
       status = 'incomplete',
       notes = COALESCE(d.notes,'') ||
               CASE WHEN COALESCE(d.notes,'') = '' THEN '' ELSE ' | ' END ||
               'تم إلغاء البصمة التلقائية — بصمة خروج مفقودة، يرجى تقديم طلب تعديل',
       updated_at = now()
  FROM deleted dl
 WHERE d.employee_id = dl.employee_id
   AND d.attendance_date = dl.att_date;