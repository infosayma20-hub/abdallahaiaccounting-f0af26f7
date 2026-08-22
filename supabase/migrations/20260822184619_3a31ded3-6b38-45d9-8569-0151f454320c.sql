-- Track how the punch was submitted: camera QR scan (physical proof at branch)
-- vs manually typed code (no physical proof → GPS enforced server-side).
ALTER TABLE public.attendance_events
  ADD COLUMN IF NOT EXISTS punch_source text NOT NULL DEFAULT 'qr_scan';

ALTER TABLE public.attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_punch_source_check;

ALTER TABLE public.attendance_events
  ADD CONSTRAINT attendance_events_punch_source_check
  CHECK (punch_source IN ('qr_scan', 'manual_code'));