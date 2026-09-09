CREATE OR REPLACE FUNCTION public.notify_owners_on_employee_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rec          RECORD;
  v_emp          RECORD;
  v_emp_name     text;
  v_branch       text;
  v_dept         text;
  v_job          text;
  v_num          text;
  v_title        text;
  v_body         text;
  v_event        text;
  v_path         text;
  v_desc         text;
  v_lines        text[] := '{}';
  v_priority     smallint := 3;
  v_notify_hr    boolean := false;
  v_hr_path      text;
BEGIN
  IF NEW.form_type NOT IN ('advance_request','loan_request','complaints','disciplinary_action') THEN
    RETURN NEW;
  END IF;

  SELECT e.full_name, e.employee_number, e.job_title, e.department, b.name AS branch_name
    INTO v_emp
    FROM public.employees e
    LEFT JOIN public.branches b ON b.id = e.branch_id
   WHERE e.id = NEW.employee_id;

  v_emp_name := COALESCE(NULLIF(TRIM(v_emp.full_name), ''), 'موظف');
  v_num      := NULLIF(TRIM(COALESCE(v_emp.employee_number,'')), '');
  v_job      := NULLIF(TRIM(COALESCE(v_emp.job_title,'')), '');
  v_dept     := NULLIF(TRIM(COALESCE(v_emp.department,'')), '');
  v_branch   := COALESCE(
                  NULLIF(TRIM(COALESCE(NEW.form_data->>'branch','')), ''),
                  NULLIF(TRIM(COALESCE(v_emp.branch_name,'')), '')
                );

  v_lines := array_append(v_lines,
    '👤 ' || v_emp_name
    || COALESCE(' (#' || v_num || ')', '')
    || COALESCE(' — ' || v_job, ''));

  IF v_branch IS NOT NULL OR v_dept IS NOT NULL THEN
    v_lines := array_append(v_lines,
      '🏢 ' || COALESCE(v_branch, '—') || COALESCE(' / ' || v_dept, ''));
  END IF;

  v_desc := NULLIF(TRIM(COALESCE(
              NEW.form_data->>'description',
              NEW.form_data->>'complaint',
              NEW.form_data->>'reason',
              NEW.form_data->>'notes','')), '');

  IF NEW.form_type IN ('advance_request','loan_request') THEN
    v_event := 'owner_advance_request';
    v_title := CASE WHEN NEW.form_type = 'loan_request' THEN '📄 طلب قرض جديد' ELSE '💰 طلب سلفة جديد' END;
    v_notify_hr := true;
    IF NULLIF(NEW.form_data->>'amount','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '💵 المبلغ: ' || (NEW.form_data->>'amount') || ' ₪');
    END IF;
    IF NULLIF(NEW.form_data->>'installments','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '🔁 الأقساط: ' || (NEW.form_data->>'installments'));
    END IF;
    IF NULLIF(NEW.form_data->>'deduction_month','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '📅 شهر الخصم: ' || (NEW.form_data->>'deduction_month'));
    END IF;
    IF v_desc IS NOT NULL THEN
      v_lines := array_append(v_lines, '📝 السبب: ' || left(v_desc, 200));
    END IF;

  ELSIF NEW.form_type = 'complaints' THEN
    v_event := 'owner_complaint';
    v_title := CASE WHEN NEW.complaint_target = 'executive'
                    THEN '📣 شكوى للإدارة العليا'
                    ELSE '📣 شكوى للموارد البشرية' END;
    v_notify_hr := (COALESCE(NEW.complaint_target, '') <> 'executive');
    IF NULLIF(NEW.form_data->>'category','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '🏷️ التصنيف: ' || (NEW.form_data->>'category'));
    END IF;
    IF NULLIF(NEW.form_data->>'subject','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '📌 الموضوع: ' || left(NEW.form_data->>'subject', 120));
    END IF;
    IF NEW.complaint_target = 'executive' THEN
      IF v_desc IS NOT NULL THEN
        v_lines := array_append(v_lines, '📝 ' || left(v_desc, 240));
      END IF;
    ELSE
      v_lines := array_append(v_lines, '🔒 المحتوى محفوظ — اضغط لعرض التفاصيل');
    END IF;

  ELSE
    v_event := 'owner_disciplinary_action';
    v_title := '⚠️ إجراء عقابي جديد';
    v_notify_hr := true;
    IF NULLIF(NEW.form_data->>'violation_type','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '🏷️ نوع المخالفة: ' || (NEW.form_data->>'violation_type'));
    END IF;
    IF NULLIF(NEW.form_data->>'action_type','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '⚖️ الإجراء: ' || (NEW.form_data->>'action_type'));
    END IF;
    IF NULLIF(NEW.form_data->>'incident_date','') IS NOT NULL THEN
      v_lines := array_append(v_lines, '📅 تاريخ الواقعة: ' || (NEW.form_data->>'incident_date'));
    END IF;
    IF v_desc IS NOT NULL THEN
      v_lines := array_append(v_lines, '📝 ' || left(v_desc, 240));
    END IF;
  END IF;

  v_lines := array_append(v_lines,
    '🕒 ' || to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD HH24:MI'));

  v_body    := array_to_string(v_lines, E'\n');
  v_path    := '/portal/dashboard?tab=requests&form=' || NEW.id::text;
  v_hr_path := '/employee-forms-management?form=' || NEW.id::text;

  -- أصحاب البوابة (كما كان)
  FOR v_rec IN
    SELECT p.auth_user_id
      FROM public.malaki_portal_users p
     WHERE p.user_id = NEW.user_id
       AND p.role = 'owner'
       AND p.is_active
       AND p.auth_user_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.enqueue_notification(
        v_rec.auth_user_id, v_event, v_title, v_body, v_path,
        jsonb_build_object('source_id', NEW.id::text, 'form_type', NEW.form_type),
        'low', v_priority,
        'ownerform:' || NEW.id::text || ':u:' || v_rec.auth_user_id::text,
        NEW.created_at, NULL
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    INSERT INTO public.notification_log (user_id, type, channel, title, body, path)
    VALUES (v_rec.auth_user_id, v_event, 'in_app', v_title, v_body, v_path);
  END LOOP;

  -- مديرو الموارد البشرية والأدمن ضمن نفس الفريق
  IF v_notify_hr THEN
    FOR v_rec IN
      SELECT DISTINCT ur.user_id AS auth_user_id
        FROM public.user_roles ur
       WHERE ur.role IN ('hr_manager'::app_role, 'admin'::app_role)
         AND public.is_team_member(ur.user_id, NEW.user_id)
         AND ur.user_id NOT IN (
           SELECT p.auth_user_id FROM public.malaki_portal_users p
            WHERE p.user_id = NEW.user_id AND p.role = 'owner'
              AND p.is_active AND p.auth_user_id IS NOT NULL
         )
    LOOP
      BEGIN
        PERFORM public.enqueue_notification(
          v_rec.auth_user_id, v_event, v_title, v_body, v_hr_path,
          jsonb_build_object('source_id', NEW.id::text, 'form_type', NEW.form_type),
          'low', v_priority,
          'hrform:' || NEW.id::text || ':u:' || v_rec.auth_user_id::text,
          NEW.created_at, NULL
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      INSERT INTO public.notification_log (user_id, type, channel, title, body, path)
      VALUES (v_rec.auth_user_id, v_event, 'in_app', v_title, v_body, v_hr_path);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$fn$;