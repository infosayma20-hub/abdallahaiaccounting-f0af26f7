CREATE OR REPLACE FUNCTION public.notify_hr_employee_birthdays()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_emp       RECORD;
  v_recipient RECORD;
  v_today     date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  v_title     text;
  v_body      text;
  v_path      text;
  v_dedup     text;
  v_count     integer := 0;
BEGIN
  FOR v_emp IN
    SELECT e.id,
           e.user_id AS owner_id,
           e.full_name,
           e.employee_number,
           e.department,
           b.name AS branch_name
      FROM public.employees e
      LEFT JOIN public.branches b ON b.id = e.branch_id
     WHERE e.is_active = true
       AND e.date_of_birth IS NOT NULL
       AND EXTRACT(MONTH FROM e.date_of_birth) = EXTRACT(MONTH FROM v_today)
       AND EXTRACT(DAY   FROM e.date_of_birth) = EXTRACT(DAY   FROM v_today)
  LOOP
    v_title := '🎂 عيد ميلاد موظف اليوم';
    v_body  := '🎉 اليوم عيد ميلاد ' || v_emp.full_name
            || COALESCE(' (#' || NULLIF(TRIM(COALESCE(v_emp.employee_number, '')), '') || ')', '')
            || COALESCE(E'\n🏢 ' || NULLIF(TRIM(COALESCE(v_emp.branch_name, '')), ''), '')
            || E'\n🕒 ' || to_char(v_today, 'YYYY-MM-DD');
    v_path  := '/hr/reports?tab=occasions';

    FOR v_recipient IN
      SELECT DISTINCT r.auth_user_id
        FROM (
          SELECT v_emp.owner_id AS auth_user_id
          UNION
          SELECT h.hr_auth_id
            FROM public.hr_manager_permissions h
           WHERE h.user_id = v_emp.owner_id
             AND h.is_active = true
             AND h.hr_auth_id IS NOT NULL
          UNION
          SELECT p.auth_user_id
            FROM public.malaki_portal_users p
           WHERE p.user_id = v_emp.owner_id
             AND p.role = 'owner'
             AND p.is_active = true
             AND p.auth_user_id IS NOT NULL
        ) r
       WHERE r.auth_user_id IS NOT NULL
    LOOP
      v_dedup := 'birthday:' || v_emp.id::text || ':' || v_today::text || ':u:' || v_recipient.auth_user_id::text;

      PERFORM public.enqueue_notification(
        v_recipient.auth_user_id,
        'employee_birthday',
        v_title,
        v_body,
        v_path,
        jsonb_build_object('source_id', v_emp.id::text, 'employee_name', v_emp.full_name),
        'low',
        3,
        v_dedup,
        now(),
        NULL
      );

      IF NOT EXISTS (
        SELECT 1
          FROM public.notification_log nl
         WHERE nl.user_id = v_recipient.auth_user_id
           AND nl.type = 'employee_birthday'
           AND nl.channel = 'in_app'
           AND nl.title = v_title
           AND nl.body = v_body
           AND (nl.sent_at AT TIME ZONE 'Asia/Hebron')::date = v_today
      ) THEN
        INSERT INTO public.notification_log (user_id, type, channel, title, body, path)
        VALUES (v_recipient.auth_user_id, 'employee_birthday', 'in_app', v_title, v_body, v_path);
      END IF;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_hr_employee_birthdays() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_hr_employee_birthdays() TO service_role;