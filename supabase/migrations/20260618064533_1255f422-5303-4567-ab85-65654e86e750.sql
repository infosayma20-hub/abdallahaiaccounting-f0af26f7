-- Cleanup stale orphan check_in events (>36h old, never closed, but attendance_days
-- already recorded a last_check_out). Marking them 'invalid' stops the employee
-- UI from displaying a stuck "تسجيل خروج" button.
UPDATE attendance_events ev
SET status = 'invalid'
FROM attendance_days d
WHERE ev.event_type = 'check_in'
  AND ev.status = 'valid'
  AND ev.event_time < now() - interval '36 hours'
  AND d.employee_id = ev.employee_id
  AND d.attendance_date = (ev.event_time AT TIME ZONE 'Asia/Hebron')::date
  AND d.last_check_out IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM attendance_events ev2
    WHERE ev2.employee_id = ev.employee_id
      AND ev2.event_type = 'check_out'
      AND ev2.status = 'valid'
      AND ev2.event_time > ev.event_time
      AND ev2.event_time < ev.event_time + interval '7 days'
  );