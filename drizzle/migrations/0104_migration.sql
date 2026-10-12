CREATE OR REPLACE FUNCTION public.notify_portal_owners_on_daily_report_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tpl text; v_rec record; v_name text; v_title text := '📋 تقرير إنجاز يومي جديد'; v_body text; v_path text;
BEGIN
  IF NEW.form_type <> 'dynamic_template' OR NEW.workflow_status IS DISTINCT FROM 'submitted' OR NEW.template_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.workflow_status IS NOT DISTINCT FROM NEW.workflow_status THEN RETURN NEW; END IF;
  BEGIN
    SELECT name INTO v_tpl FROM form_templates WHERE id = NEW.template_id;
    IF v_tpl IS NULL OR v_tpl NOT ILIKE '%الإنجاز اليومي%' THEN RETURN NEW; END IF;
    SELECT full_name INTO v_name FROM employees WHERE id = NEW.employee_id;
    v_body := '👤 ' || COALESCE(NULLIF(trim(v_name),''),'موظف') || E'\n📑 ' || v_tpl
      || E'\n🕒 ' || to_char(now() AT TIME ZONE 'Asia/Hebron','YYYY-MM-DD HH24:MI');
    v_path := '/portal/dashboard?tab=requests&form=' || NEW.id::text;
    FOR v_rec IN
      SELECT DISTINCT p.auth_user_id FROM malaki_portal_users p
       WHERE p.user_id = NEW.user_id AND p.role = 'owner' AND p.is_active AND p.auth_user_id IS NOT NULL
    LOOP
      IF EXISTS (SELECT 1 FROM notification_log l WHERE l.user_id = v_rec.auth_user_id AND l.type = 'owner_daily_report' AND l.path = v_path) THEN CONTINUE; END IF;
      BEGIN
        PERFORM enqueue_notification(v_rec.auth_user_id, 'owner_daily_report', v_title, v_body, v_path,
          jsonb_build_object('source_id', NEW.id::text, 'form_type', NEW.form_type), 'low', 3::smallint,
          'dailyreport:' || NEW.id::text || ':u:' || v_rec.auth_user_id::text, now(), NULL);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      INSERT INTO notification_log (user_id, type, channel, title, body, path)
      VALUES (v_rec.auth_user_id, 'owner_daily_report', 'in_app', v_title, v_body, v_path);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_portal_owners_on_daily_report ON public.employee_forms;
CREATE TRIGGER trg_notify_portal_owners_on_daily_report
AFTER INSERT OR UPDATE OF workflow_status ON public.employee_forms
FOR EACH ROW EXECUTE FUNCTION public.notify_portal_owners_on_daily_report_submit();