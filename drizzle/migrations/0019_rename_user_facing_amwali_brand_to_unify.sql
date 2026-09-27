CREATE OR REPLACE FUNCTION public.trg_notify_missing_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str text;
BEGIN
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
      'يوم ' || v_date_str || ' ناقص بصمة خروج. الرجاء تقديم طلب تعديل من تطبيق يونيفاي.',
      '/employee/alerts'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;