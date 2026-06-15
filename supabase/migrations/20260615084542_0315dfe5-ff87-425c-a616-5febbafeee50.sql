
-- 1) Flip the 14 Jun 22:26 UTC (15 Jun 01:26 local) from check_in to check_out
UPDATE public.attendance_events
SET event_type = 'check_out',
    notes = COALESCE(notes,'') || ' [HR-fix: flipped from check_in (was opening new day in error)]'
WHERE id = '060ca5e8-b21b-4809-9bfb-1c5065903b44';

-- 2) Delete the now-orphan check_out at 15 Jun 07:17:00 UTC (the user re-checked-in 15s later)
DELETE FROM public.attendance_events
WHERE id = '7c2b9083-b8c9-4842-9661-ab6df56e2650';

-- 3) Rebuild attendance_days for 14 Jun: in 13:32 UTC → out 22:26 UTC
INSERT INTO public.attendance_days (
  employee_id, auth_user_id, branch_id, attendance_date,
  first_check_in, last_check_out, total_hours, overtime_hours, status,
  is_manually_adjusted, notes
)
SELECT
  e.employee_id,
  e.auth_user_id,
  e.branch_id,
  DATE '2026-06-14',
  TIMESTAMPTZ '2026-06-14 13:32:28.708+00',
  TIMESTAMPTZ '2026-06-14 22:26:51.419+00',
  ROUND( EXTRACT(EPOCH FROM (TIMESTAMPTZ '2026-06-14 22:26:51.419+00' - TIMESTAMPTZ '2026-06-14 13:32:28.708+00')) / 3600.0 :: numeric, 2 ),
  0,
  'late',  -- evening shift but matches existing late rule (hour>=9)
  true,
  'HR-fix: closed by 1:26 AM punch (originally mis-logged as next-day check_in)'
FROM public.attendance_events e
WHERE e.id = 'f4db9b35-6622-44ad-86d3-277acd82dbc0'
ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
  first_check_in = EXCLUDED.first_check_in,
  last_check_out = EXCLUDED.last_check_out,
  total_hours = EXCLUDED.total_hours,
  overtime_hours = EXCLUDED.overtime_hours,
  status = EXCLUDED.status,
  is_manually_adjusted = true,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 4) Rebuild attendance_days for 15 Jun: only the 10:17 check_in remains, no check_out yet
UPDATE public.attendance_days
SET first_check_in = TIMESTAMPTZ '2026-06-15 07:17:15.527+00',
    last_check_out = NULL,
    total_hours = 0,
    overtime_hours = 0,
    status = 'incomplete',
    is_manually_adjusted = true,
    notes = 'HR-fix: re-scoped to start at 10:17 AM (previous 1:26 AM punch reassigned as 14 Jun check-out)',
    updated_at = now()
WHERE employee_id = '88640ff4-4a06-4c5d-9f1f-337124661351'
  AND attendance_date = DATE '2026-06-15';
