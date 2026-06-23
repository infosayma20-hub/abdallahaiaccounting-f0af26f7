-- Fix Adel Hawamda's 23/06/2026 attendance row: the last_check_out was wrongly
-- populated with the previous day's checkout event (22/06 21:09 UTC = 00:09 local 23/06).
-- Clear the orphan checkout; the day is still open (employee hasn't checked out yet).
UPDATE public.attendance_days
SET last_check_out = NULL,
    total_hours = 0,
    overtime_hours = 0,
    net_work_minutes = 0,
    status = 'late',
    updated_at = now()
WHERE employee_id = 'edc9edeb-d583-4cf1-885f-ab2dbb199d21'
  AND attendance_date = '2026-06-23'
  AND last_check_out = '2026-06-22 21:09:27.866189+00';