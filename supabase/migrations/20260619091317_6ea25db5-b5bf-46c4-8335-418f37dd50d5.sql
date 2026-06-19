CREATE OR REPLACE FUNCTION public.enforce_server_event_time()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_time TIMESTAMPTZ;
  v_skew INTEGER;
  v_threshold INTEGER := 120;
BEGIN
  IF NEW.server_recorded IS DISTINCT FROM false THEN
    -- Prefer the explicit client_reported_time from the Edge Function
    -- (the real user-device clock). Fall back to event_time only if missing.
    v_client_time := COALESCE(NEW.client_reported_time, NEW.event_time);

    NEW.event_time := now();
    NEW.client_reported_time := v_client_time;

    IF v_client_time IS NOT NULL THEN
      v_skew := EXTRACT(EPOCH FROM (now() - v_client_time))::INTEGER;
      NEW.time_skew_seconds := v_skew;

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
$function$;