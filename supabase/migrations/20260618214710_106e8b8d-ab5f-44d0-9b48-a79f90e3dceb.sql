
-- H1: Overload notify_employee_push to accept sensitivity
CREATE OR REPLACE FUNCTION public.notify_employee_push(
  _user_id uuid,
  _title text,
  _body text,
  _path text DEFAULT '/employee'::text,
  _sensitivity text DEFAULT 'low'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.enqueue_notification(
    _recipient_user_id := _user_id,
    _event_type := 'legacy_push',
    _title := _title,
    _body := _body,
    _path := _path,
    _data := jsonb_build_object('path', _path),
    _sensitivity := COALESCE(_sensitivity, 'low'),
    _priority := 5
  );
END;
$function$;

-- H1: Payslip paid trigger → use high sensitivity so amount is masked on lock screen
CREATE OR REPLACE FUNCTION public.trg_notify_payslip_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid;
  v_month_label text;
  v_amount text;
BEGIN
  IF NEW.is_paid IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF OLD.is_paid IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT e.auth_user_id INTO v_auth
  FROM public.employees e
  WHERE e.id = NEW.employee_id
  LIMIT 1;

  IF v_auth IS NULL THEN
    RETURN NEW;
  END IF;

  v_month_label := lpad(NEW.period_month::text, 2, '0') || '/' || NEW.period_year::text;
  v_amount := to_char(COALESCE(NEW.net_salary, 0), 'FM999,999,990.00');

  BEGIN
    PERFORM public.notify_employee_push(
      v_auth,
      '💰 تم استلام راتبك',
      'راتب شهر ' || v_month_label || ' بقيمة ' || v_amount || ' ₪ تم صرفه. اضغط لعرض القسيمة.',
      '/employee',
      'high'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

-- M1: Helper to detect stale notifications (source event older than threshold)
CREATE OR REPLACE FUNCTION public.notification_is_stale(
  _source_created_at timestamptz,
  _event_type text,
  _max_age_hours int DEFAULT 72
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _source_created_at IS NULL THEN false
    -- Digest/aggregated/manual events shouldn't be aged out
    WHEN _event_type IN ('legacy_push','manager_digest') THEN false
    ELSE _source_created_at < (now() - make_interval(hours => _max_age_hours))
  END;
$$;
