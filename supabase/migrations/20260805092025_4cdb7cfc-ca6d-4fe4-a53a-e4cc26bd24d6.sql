CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON public.attendance_days (attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_events_emp_time_all ON public.attendance_events (employee_id, event_time);
CREATE INDEX IF NOT EXISTS idx_attendance_events_time ON public.attendance_events (event_time);
CREATE INDEX IF NOT EXISTS idx_employee_leaves_status_dates ON public.employee_leaves (status, start_date, end_date);