
CREATE OR REPLACE FUNCTION public.guard_attendance_events_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _owner uuid;
  _date  date;
  _branch uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _owner := OLD.auth_user_id; _date := (OLD.event_time AT TIME ZONE 'Asia/Hebron')::date; _branch := OLD.branch_id;
  ELSE
    _owner := NEW.auth_user_id; _date := (NEW.event_time AT TIME ZONE 'Asia/Hebron')::date; _branch := NEW.branch_id;
  END IF;

  IF public.is_attendance_day_locked(_owner, _date, _branch) THEN
    RAISE EXCEPTION 'تم إغلاق يوم % من قبل الإدارة. لا يمكن تسجيل البصمة. الرجاء التواصل مع المدير لفتح اليوم.', to_char(_date,'YYYY-MM-DD')
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
