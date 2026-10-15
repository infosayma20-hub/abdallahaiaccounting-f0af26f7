CREATE OR REPLACE FUNCTION public._ops_fmt_time(_v text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
BEGIN
  IF _v IS NULL OR _v='' THEN RETURN '—'; END IF;
  IF _v ~ '^\d{1,2}:\d{2}' THEN RETURN left(_v,5); END IF;
  RETURN to_char(_v::timestamptz AT TIME ZONE 'Asia/Hebron','HH24:MI');
EXCEPTION WHEN OTHERS THEN RETURN _v;
END $$;

CREATE OR REPLACE FUNCTION public.tg_ops_alert_attendance_edit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_owner uuid; v_emp text; v_date text;
BEGIN
  IF NEW.table_name<>'attendance_days' THEN RETURN NEW; END IF;
  SELECT e.user_id, e.full_name, d.attendance_date::text INTO v_owner, v_emp, v_date
    FROM attendance_days d JOIN employees e ON e.id=d.employee_id WHERE d.id=NEW.record_id;
  PERFORM notify_ops_alert(v_owner,'ops_attendance_edit','🕘 تعديل بصمة',
    '👤 الموظف: '||COALESCE(v_emp,'—')||E'\n📅 '||COALESCE(v_date, NEW.new_values->>'attendance_date','—')
    ||E'\n⏱️ قبل: '||_ops_fmt_time(NEW.old_values->>'first_check_in')||' - '||_ops_fmt_time(NEW.old_values->>'last_check_out')
    ||E'\n⏱️ بعد: '||_ops_fmt_time(COALESCE(NEW.new_values->>'requested_in',NEW.new_values->>'first_check_in'))||' - '||_ops_fmt_time(COALESCE(NEW.new_values->>'requested_out',NEW.new_values->>'last_check_out'))
    ||E'\n✏️ عدّلها: '||_ops_user_label(NEW.changed_by)
    ||E'\n📝 '||COALESCE(NULLIF(trim(NEW.reason),''),'بدون سبب')
    ||E'\n🕒 '||to_char(NEW.created_at AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI'),
    NULL, 'att:'||NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;