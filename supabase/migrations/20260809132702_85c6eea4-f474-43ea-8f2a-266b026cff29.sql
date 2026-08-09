-- Owners (portal role = owner) get notified when an employee submits
-- an advance/loan request, a complaint, or a disciplinary action.

CREATE OR REPLACE FUNCTION public.notify_owners_on_employee_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner        RECORD;
  v_emp_name     text;
  v_branch       text;
  v_title        text;
  v_body         text;
  v_event        text;
  v_path         text;
  v_priority     smallint := 3;
BEGIN
  IF NEW.form_type NOT IN ('advance_request','loan_request','complaints','disciplinary_action') THEN
    RETURN NEW;
  END IF;

  SELECT e.full_name INTO v_emp_name FROM public.employees e WHERE e.id = NEW.employee_id;
  v_emp_name := COALESCE(NULLIF(TRIM(v_emp_name), ''), 'موظف');
  v_branch := NULLIF(TRIM(COALESCE(NEW.form_data->>'branch','')), '');

  IF NEW.form_type IN ('advance_request','loan_request') THEN
    v_event := 'owner_advance_request';
    v_title := CASE WHEN NEW.form_type = 'loan_request' THEN '📄 طلب قرض جديد' ELSE '💰 طلب سلفة جديد' END;
    v_body  := v_emp_name
               || COALESCE(' • ' || v_branch, '')
               || COALESCE(' • المبلغ: ' || (NEW.form_data->>'amount'), '')
               || COALESCE(' • السبب: ' || left(NEW.form_data->>'reason', 120), '');
  ELSIF NEW.form_type = 'complaints' THEN
    v_event := 'owner_complaint';
    v_title := CASE WHEN NEW.complaint_target = 'executive'
                    THEN '📣 شكوى مقدمة للإدارة العليا'
                    ELSE '📣 شكوى مقدمة للموارد البشرية' END;
    -- HR-targeted complaints stay private: notify without exposing the content.
    v_body  := CASE WHEN NEW.complaint_target = 'executive'
                    THEN v_emp_name || COALESCE(' • ' || v_branch, '') || COALESCE(' • ' || left(COALESCE(NEW.form_data->>'description', NEW.form_data->>'complaint', ''), 140), '')
                    ELSE v_emp_name || COALESCE(' • ' || v_branch, '') || ' • تم تقديم شكوى للموارد البشرية' END;
  ELSE
    v_event := 'owner_disciplinary_action';
    v_title := '⚠️ إجراء عقابي جديد';
    v_body  := v_emp_name
               || COALESCE(' • ' || v_branch, '')
               || COALESCE(' • ' || left(COALESCE(NEW.form_data->>'description',''), 140), '');
  END IF;

  v_path := '/portal/dashboard?tab=requests&form=' || NEW.id::text;

  FOR v_owner IN
    SELECT p.auth_user_id
      FROM public.malaki_portal_users p
     WHERE p.user_id = NEW.user_id
       AND p.role = 'owner'
       AND p.is_active
       AND p.auth_user_id IS NOT NULL
  LOOP
    -- Push (queue → notifications-worker)
    PERFORM public.enqueue_notification(
      v_owner.auth_user_id,
      v_event,
      v_title,
      v_body,
      v_path,
      jsonb_build_object('source_id', NEW.id::text, 'form_type', NEW.form_type),
      'low',
      v_priority,
      'ownerform:' || NEW.id::text || ':u:' || v_owner.auth_user_id::text,
      NEW.created_at,
      NULL
    );

    -- In-app bell entry
    INSERT INTO public.notification_log (user_id, type, channel, title, body, path)
    VALUES (v_owner.auth_user_id, v_event, 'in_app', v_title, v_body, v_path);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_owners_on_employee_form ON public.employee_forms;
CREATE TRIGGER trg_notify_owners_on_employee_form
AFTER INSERT ON public.employee_forms
FOR EACH ROW EXECUTE FUNCTION public.notify_owners_on_employee_form();

CREATE INDEX IF NOT EXISTS idx_notif_log_user_created
  ON public.notification_log (user_id, created_at DESC);