-- Mark every stale orphan check_in (>36h old, no following check_out within 7d)
-- as invalid. This unblocks the employee's UI and surfaces the incomplete day
-- to HR via the existing correction-request flow (missing_checkout).
UPDATE attendance_events ev
SET status = 'invalid'
WHERE ev.event_type = 'check_in'
  AND ev.status = 'valid'
  AND ev.event_time < now() - interval '36 hours'
  AND NOT EXISTS (
    SELECT 1 FROM attendance_events ev2
    WHERE ev2.employee_id = ev.employee_id
      AND ev2.event_type = 'check_out'
      AND ev2.status = 'valid'
      AND ev2.event_time > ev.event_time
      AND ev2.event_time < ev.event_time + interval '7 days'
  );