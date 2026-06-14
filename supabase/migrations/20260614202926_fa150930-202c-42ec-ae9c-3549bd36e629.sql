ALTER TABLE public.attendance_days REPLICA IDENTITY FULL;
ALTER TABLE public.correction_requests REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.correction_requests;