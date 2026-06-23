-- Cleanup: clear orphan last_check_out values where the checkout timestamp
-- is BEFORE that day's first_check_in (belongs to previous day's session).
UPDATE public.attendance_days
SET last_check_out = NULL,
    total_hours = 0,
    overtime_hours = 0,
    net_work_minutes = 0,
    updated_at = now()
WHERE last_check_out IS NOT NULL
  AND (first_check_in IS NULL OR last_check_out <= first_check_in);