DO $r$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT employee_id, attendance_date FROM public.attendance_days
     WHERE net_work_minutes = 960 AND attendance_date >= DATE '2026-08-21'
       AND COALESCE(is_manually_adjusted,false) = false
  LOOP
    PERFORM public.recompute_attendance_day(r.employee_id, r.attendance_date);
  END LOOP;
END
$r$;