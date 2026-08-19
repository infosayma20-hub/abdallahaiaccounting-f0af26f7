REVOKE ALL ON FUNCTION public.set_attendance_break_duration() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance_break_duration() TO service_role;

REVOKE ALL ON FUNCTION public.recompute_attendance_day(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day(uuid,date) TO service_role;

REVOKE ALL ON FUNCTION public.recompute_attendance_day_totals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day_totals(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.attendance_break_recompute_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_break_recompute_trigger() TO service_role;