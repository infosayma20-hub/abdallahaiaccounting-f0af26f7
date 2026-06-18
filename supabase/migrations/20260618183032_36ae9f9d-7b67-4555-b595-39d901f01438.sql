
-- ============================================================
-- EMPLOYEE PUSH NOTIFICATIONS — automatic triggers
-- ============================================================
-- Sends FCM push notifications to employees on 3 events:
--   1) attendance_days.status -> 'incomplete'          (missing fingerprint)
--   2) correction_requests.status -> 'approved'/'rejected'  (request answered)
--   3) employee_payroll.is_paid -> true                (payslip dropped)
-- Uses pg_net + the vault-stored service role key already provisioned by
-- the email_infra migration. Failures never block the originating write.
-- ============================================================

-- Shared helper: enqueue a push to a specific auth user.
CREATE OR REPLACE FUNCTION public.notify_employee_push(
  _user_id uuid,
  _title text,
  _body text,
  _path text DEFAULT '/employee'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF _user_id IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_key IS NULL OR length(v_key) < 20 THEN
    RAISE NOTICE 'notify_employee_push: vault key missing — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://omwuyscprzexgmxgittp.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'user_id', _user_id,
      'title',   _title,
      'body',    _body,
      'path',    _path
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_employee_push(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_employee_push(uuid, text, text, text) TO service_role;

-- ============================================================
-- 1) MISSING FINGERPRINT  (attendance_days -> incomplete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notify_missing_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str text;
BEGIN
  -- Only fire when day BECOMES incomplete (or inserted as incomplete)
  IF NEW.status <> 'incomplete' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'incomplete' THEN
    RETURN NEW;
  END IF;

  v_date_str := to_char(NEW.attendance_date, 'DD/MM/YYYY');

  BEGIN
    PERFORM public.notify_employee_push(
      NEW.auth_user_id,
      'بصمة ناقصة ⚠️',
      'يوم ' || v_date_str || ' ناقص بصمة خروج. الرجاء تقديم طلب تعديل من تطبيق أموالي.',
      '/employee/alerts'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block attendance writes due to push errors
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_missing_fingerprint ON public.attendance_days;
CREATE TRIGGER trg_notify_missing_fingerprint
  AFTER INSERT OR UPDATE OF status ON public.attendance_days
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_missing_fingerprint();

-- ============================================================
-- 2) CORRECTION REQUEST ANSWERED  (pending -> approved/rejected)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notify_correction_answered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type_label text;
  v_status_label text;
  v_title text;
  v_body text;
BEGIN
  IF NEW.status NOT IN ('approved','rejected') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_type_label := CASE NEW.request_type
    WHEN 'missing_checkin'   THEN 'تعديل بصمة دخول'
    WHEN 'missing_checkout'  THEN 'تعديل بصمة خروج'
    WHEN 'wrong_time'        THEN 'تعديل وقت البصمة'
    WHEN 'leave_request'     THEN 'طلب إجازة'
    WHEN 'advance_request'   THEN 'طلب سلفة'
    WHEN 'overtime_request'  THEN 'طلب ساعات إضافية'
    WHEN 'hr_message'        THEN 'رسالة من الموارد البشرية'
    ELSE 'طلبك'
  END;

  IF NEW.status = 'approved' THEN
    v_title := '✅ تم قبول طلبك';
    v_body  := 'تمت الموافقة على ' || v_type_label || '. اضغط للتفاصيل.';
  ELSE
    v_title := '❌ تم رفض طلبك';
    v_body  := 'تم رفض ' || v_type_label
            || COALESCE(' — السبب: ' || NULLIF(NEW.review_notes,''), '')
            || '. اضغط للتفاصيل.';
  END IF;

  BEGIN
    PERFORM public.notify_employee_push(
      NEW.auth_user_id,
      v_title,
      v_body,
      '/employee/alerts'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_correction_answered ON public.correction_requests;
CREATE TRIGGER trg_notify_correction_answered
  AFTER UPDATE OF status ON public.correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_correction_answered();

-- ============================================================
-- 3) PAYSLIP PAID  (employee_payroll.is_paid -> true)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notify_payslip_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      '/employee'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payslip_paid ON public.employee_payroll;
CREATE TRIGGER trg_notify_payslip_paid
  AFTER UPDATE OF is_paid ON public.employee_payroll
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_payslip_paid();
