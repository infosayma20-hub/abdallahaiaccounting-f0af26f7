
-- 1) New audit/skew columns on attendance_events
ALTER TABLE public.attendance_events
  ADD COLUMN IF NOT EXISTS client_reported_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_skew_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS server_recorded BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.attendance_events.client_reported_time IS 'Timestamp reported by the employee device — for audit ONLY, never trusted.';
COMMENT ON COLUMN public.attendance_events.time_skew_seconds IS 'Difference (server_now - client_reported_time) in seconds.';
COMMENT ON COLUMN public.attendance_events.server_recorded IS 'True when event_time was forced to server now() (mobile/web). False for trusted external devices (ZKTeco).';

-- 2) Company timezone
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS company_timezone TEXT NOT NULL DEFAULT 'Asia/Hebron';

-- 3) Trigger: force server time + detect skew
CREATE OR REPLACE FUNCTION public.enforce_server_event_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_time TIMESTAMPTZ;
  v_skew INTEGER;
  v_threshold INTEGER := 120; -- seconds
BEGIN
  -- Only enforce on rows flagged as server_recorded (mobile/web punches).
  -- ZKTeco webhook explicitly sets server_recorded=false to preserve device time.
  IF NEW.server_recorded IS DISTINCT FROM false THEN
    v_client_time := NEW.event_time;

    -- Hard override: trust ONLY server now()
    NEW.event_time := now();
    NEW.client_reported_time := v_client_time;

    IF v_client_time IS NOT NULL THEN
      v_skew := EXTRACT(EPOCH FROM (now() - v_client_time))::INTEGER;
      NEW.time_skew_seconds := v_skew;

      -- Flag suspicious devices if skew is large (positive or negative)
      IF ABS(v_skew) > v_threshold THEN
        BEGIN
          INSERT INTO public.attendance_audit_logs(
            employee_id, event_type, action, details, created_at
          ) VALUES (
            NEW.employee_id,
            NEW.event_type,
            'time_skew_detected',
            jsonb_build_object(
              'skew_seconds', v_skew,
              'client_time', v_client_time,
              'server_time', now(),
              'device_info', NEW.device_info
            ),
            now()
          );
        EXCEPTION WHEN OTHERS THEN
          -- never block the punch because of audit failure
          NULL;
        END;

        BEGIN
          INSERT INTO public.employee_device_alerts(
            employee_id, alert_type, severity, message, metadata, created_at
          ) VALUES (
            NEW.employee_id,
            'device_time_manipulation',
            CASE WHEN ABS(v_skew) > 600 THEN 'high' ELSE 'medium' END,
            'فرق توقيت غير طبيعي بين جهاز الموظف والسيرفر: ' || v_skew || ' ثانية',
            jsonb_build_object('skew_seconds', v_skew, 'device_info', NEW.device_info),
            now()
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_server_event_time ON public.attendance_events;
CREATE TRIGGER trg_enforce_server_event_time
  BEFORE INSERT ON public.attendance_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_server_event_time();

-- 4) Index to speed up skew-based queries
CREATE INDEX IF NOT EXISTS idx_attendance_events_time_skew
  ON public.attendance_events(employee_id, time_skew_seconds)
  WHERE time_skew_seconds IS NOT NULL AND ABS(time_skew_seconds) > 120;
