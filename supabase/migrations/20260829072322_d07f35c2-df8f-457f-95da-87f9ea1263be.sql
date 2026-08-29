CREATE OR REPLACE FUNCTION public.guard_attendance_duplicate_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  prev_type text;
  prev_time timestamptz;
BEGIN
  IF NEW.event_type NOT IN ('check_in','check_out') OR COALESCE(NEW.status,'valid') <> 'valid' THEN
    RETURN NEW;
  END IF;

  SELECT event_type, event_time
    INTO prev_type, prev_time
  FROM public.attendance_events
  WHERE employee_id = NEW.employee_id
    AND status = 'valid'
    AND event_time < NEW.event_time
  ORDER BY event_time DESC
  LIMIT 1;

  IF prev_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Phantom check_out: a check_out fired within 60s of the check_in that
  -- opened the session is a double-tap / double-submit, never a real shift.
  -- Invalidate the phantom itself so the session keeps running.
  IF NEW.event_type = 'check_out'
     AND prev_type = 'check_in'
     AND (NEW.event_time - prev_time) <= interval '60 seconds' THEN
    NEW.status := 'invalid';
    NEW.notes  := COALESCE(NEW.notes || E'\n', '') ||
                  'auto-invalidated phantom check_out within 60s of check_in';
    RETURN NEW;
  END IF;

  -- Duplicate check_in right after a REAL check_out (session lasted >= 60s).
  IF NEW.event_type = 'check_in'
     AND prev_type = 'check_out'
     AND (NEW.event_time - prev_time) <= interval '60 seconds' THEN
    NEW.status := 'invalid';
    NEW.notes  := COALESCE(NEW.notes || E'\n', '') ||
                  'auto-invalidated duplicate QR check_in within 60s of check_out';
  END IF;

  RETURN NEW;
END;
$$;

-- Retro-correction: 2026-08-25, employee مصعب قطب
UPDATE public.attendance_events
SET status = 'invalid',
    notes = COALESCE(notes || E'\n', '') || 'auto-invalidated phantom check_out within 60s of check_in (retro-fix 2026-08-25)'
WHERE id = '0e92c9ec-8b79-489c-85c3-4c8e3bcc9b2f';

UPDATE public.attendance_events
SET notes = 'superseded: phantom check_out at 14:51:30 was invalidated; session continues from 14:51:05'
WHERE id = '5581cd46-1fec-49ab-8504-4e6af2acc824';

SELECT public.recompute_attendance_day('1ed79162-105b-4f16-814d-8d3692b4c5f0'::uuid, '2026-08-25'::date);