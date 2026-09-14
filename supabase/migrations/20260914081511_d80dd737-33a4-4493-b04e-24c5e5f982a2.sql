-- 1) جدول مشتركي إشعارات النماذج (إضافي بالكامل)
CREATE TABLE IF NOT EXISTS public.form_notification_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                -- صاحب الحساب (المستأجر)
  auth_user_id uuid NOT NULL,           -- المستلم
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  form_type text NOT NULL,              -- نوع النموذج أو 'departure_violations'
  scope text NOT NULL DEFAULT 'branches' CHECK (scope IN ('branches','all')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, auth_user_id, form_type)
);

CREATE INDEX IF NOT EXISTS idx_fns_lookup
  ON public.form_notification_subscribers (user_id, form_type) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_notification_subscribers TO authenticated;
GRANT ALL ON public.form_notification_subscribers TO service_role;

ALTER TABLE public.form_notification_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fns_manage_by_owner_or_hr"
  ON public.form_notification_subscribers
  FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "fns_read_own"
  ON public.form_notification_subscribers
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE TRIGGER trg_fns_updated_at
  BEFORE UPDATE ON public.form_notification_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) توسيع تنبيه النماذج (إضافي: المستلمون الحاليون كما هم)
CREATE OR REPLACE FUNCTION public.notify_owners_on_employee_form()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_is_core      boolean;
  v_has_subs     boolean;
BEGIN
  v_is_core := NEW.form_type IN ('advance_request','loan_request','complaints','disciplinary_action');

  SELECT EXISTS (
    SELECT 1 FROM public.form_notification_subscribers s
     WHERE s.is_active
       AND s.user_id = NEW.user_id
       AND s.form_type = NEW.form_type
  ) INTO v_has_subs;

  IF NOT v_is_core AND NOT v_has_subs THEN
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

  ELSIF NEW.form_type = 'disciplinary_action' THEN
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
      v_lines := array_append(v_lines, '📅 تاريخ الحادثة: ' || (NEW.form_data->>'incident_date'));
    END IF;
    IF v_desc IS NOT NULL THEN
      v_lines := array_append(v_lines, '📝 ' || left(v_desc, 240));
    END IF;

  ELSE
    -- أنواع إضافية: تُرسل لمشتركي النوع فقط
    v_event := 'form_subscriber_' || NEW.form_type;
    v_title := CASE NEW.form_type
                 WHEN 'equipment_fault'  THEN '🛠️ بلاغ عطل جديد'
                 WHEN 'facility_quality' THEN '🧹 تقرير جودة ونظافة جديد'
                 ELSE '📋 نموذج جديد'
               END;
    v_notify_hr := false;
    IF v_desc IS NOT NULL THEN
      v_lines := array_append(v_lines, '📝 ' || left(v_desc, 240));
    END IF;
  END IF;

  v_lines := array_append(v_lines,
    '🕒 ' || to_char(COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD HH24:MI'));

  v_body    := array_to_string(v_lines, E'\n');
  v_path    := '/portal/dashboard?tab=requests&form=' || NEW.id::text;
  v_hr_path := '/employee-forms-management?form=' || NEW.id::text;

  IF v_is_core THEN
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
  END IF;

  -- مشتركو النوع (إضافي)
  IF v_has_subs THEN
    FOR v_rec IN
      SELECT DISTINCT s.auth_user_id
        FROM public.form_notification_subscribers s
       WHERE s.is_active
         AND s.user_id = NEW.user_id
         AND s.form_type = NEW.form_type
         AND s.auth_user_id IS NOT NULL
    LOOP
      BEGIN
        PERFORM public.enqueue_notification(
          v_rec.auth_user_id, v_event, v_title, v_body, '/employee',
          jsonb_build_object('source_id', NEW.id::text, 'form_type', NEW.form_type),
          'low', v_priority,
          'subform:' || NEW.id::text || ':u:' || v_rec.auth_user_id::text,
          NEW.created_at, NULL
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      BEGIN
        INSERT INTO public.notification_log (user_id, type, channel, title, body, path)
        VALUES (v_rec.auth_user_id, v_event, 'in_app', v_title, v_body, '/employee');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) إشعار يومي بتجاوزات المغادرات (لمشتركي 'departure_violations')
CREATE OR REPLACE FUNCTION public.notify_departure_violations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub     RECORD;
  v_day     date := (now() AT TIME ZONE 'Asia/Hebron')::date - 1;
  v_cap     int;
  v_enabled boolean;
  v_lines   text[];
  v_body    text;
  v_title   text;
  v_rec     RECORD;
BEGIN
  FOR v_sub IN
    SELECT s.*, e.id AS emp_id
      FROM public.form_notification_subscribers s
      LEFT JOIN public.employees e ON e.id = s.employee_id
     WHERE s.is_active
       AND s.form_type = 'departure_violations'
       AND s.auth_user_id IS NOT NULL
  LOOP
    SELECT cs.hr_departure_cap_enabled, COALESCE(cs.hr_departure_cap_minutes, 30)
      INTO v_enabled, v_cap
      FROM public.company_settings cs
     WHERE cs.user_id = v_sub.user_id
     LIMIT 1;

    CONTINUE WHEN NOT COALESCE(v_enabled, false);

    v_lines := '{}';
    FOR v_rec IN
      SELECT emp.full_name, d.total_break_minutes
        FROM public.attendance_days d
        JOIN public.employees emp ON emp.id = d.employee_id
       WHERE d.attendance_date = v_day
         AND COALESCE(d.total_break_minutes, 0) > v_cap
         AND emp.user_id = v_sub.user_id
         AND (
           v_sub.scope = 'all'
           OR d.branch_id IN (
             SELECT bma.branch_id FROM public.branch_manager_assignments bma
              WHERE bma.user_id = v_sub.auth_user_id
           )
         )
       ORDER BY d.total_break_minutes DESC
       LIMIT 30
    LOOP
      v_lines := array_append(v_lines,
        '• ' || v_rec.full_name || ' — ' || v_rec.total_break_minutes::text || ' دقيقة');
    END LOOP;

    CONTINUE WHEN array_length(v_lines, 1) IS NULL;

    v_title := '⏱️ تجاوزات مغادرة ' || to_char(v_day, 'YYYY-MM-DD');
    v_body  := 'السقف اليومي: ' || v_cap::text || ' دقيقة' || E'\n'
               || array_to_string(v_lines, E'\n');

    BEGIN
      PERFORM public.enqueue_notification(
        v_sub.auth_user_id, 'departure_violations', v_title, v_body,
        '/employee/team-attendance',
        jsonb_build_object('day', v_day::text),
        'low', 3::smallint,
        'depviol:' || v_day::text || ':u:' || v_sub.auth_user_id::text,
        now(), NULL
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$function$;