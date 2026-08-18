ALTER FUNCTION public.recompute_attendance_day(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.recompute_attendance_day_totals(uuid) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_day_totals(uuid) TO authenticated, service_role;