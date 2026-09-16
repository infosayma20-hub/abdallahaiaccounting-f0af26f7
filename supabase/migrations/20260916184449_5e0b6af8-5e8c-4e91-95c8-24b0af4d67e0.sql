UPDATE public.portal_feature_permissions
SET auth_user_id = '955ca207-eb74-412f-b424-ef22ca79a98c'
WHERE auth_user_id = '955ca207-eb74-412f-b424-ef22ca79a98e'
  AND feature_key = 'employee_evaluations'
  AND NOT EXISTS (
    SELECT 1 FROM public.portal_feature_permissions p2
    WHERE p2.auth_user_id = '955ca207-eb74-412f-b424-ef22ca79a98c' AND p2.feature_key = 'employee_evaluations'
  );

DELETE FROM public.portal_feature_permissions
WHERE auth_user_id NOT IN (SELECT id FROM auth.users);

CREATE OR REPLACE FUNCTION public.notify_portal_owners_on_evaluation_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_template record; v_rec record; v_subject_name text; v_evaluator_name text; v_body text; v_path text;
BEGIN
  IF NEW.form_type <> 'dynamic_template' OR NEW.workflow_status <> 'submitted' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.workflow_status IS NOT DISTINCT FROM NEW.workflow_status THEN RETURN NEW; END IF;

  BEGIN
    SELECT id, schema INTO v_template FROM public.form_templates WHERE id = NEW.template_id;
    IF v_template.id IS NULL
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_template.schema->'sections', '[]'::jsonb)) s WHERE s->>'key' = 'criteria' AND jsonb_array_length(COALESCE(s->'fields', '[]'::jsonb)) > 0)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(v_template.schema->'sections', '[]'::jsonb)) s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s->'fields', '[]'::jsonb)) f WHERE f->>'key' = 'employee_name')
    THEN RETURN NEW; END IF;

    SELECT full_name INTO v_subject_name FROM public.employees WHERE id = NEW.subject_employee_id;
    SELECT full_name INTO v_evaluator_name FROM public.employees WHERE id = NEW.employee_id;
    v_subject_name := COALESCE(NULLIF(trim(v_subject_name), ''), NULLIF(trim(NEW.form_data->'header'->>'employee_name'), ''), 'موظف');
    v_evaluator_name := COALESCE(NULLIF(trim(v_evaluator_name), ''), 'مدير');
    v_path := '/portal/dashboard?tab=evaluations&evaluation=' || NEW.id::text;
    v_body := 'الموظف: ' || v_subject_name || E'\nالمدير المقيّم: ' || v_evaluator_name;

    FOR v_rec IN
      SELECT p.auth_user_id
      FROM public.portal_feature_permissions p
      JOIN auth.users u ON u.id = p.auth_user_id
      WHERE p.user_id = NEW.user_id AND p.feature_key = 'employee_evaluations' AND p.is_active
    LOOP
      BEGIN
        PERFORM public.enqueue_notification(v_rec.auth_user_id, 'owner_employee_evaluation', 'تقييم موظف جديد', v_body, v_path, jsonb_build_object('source_id', NEW.id::text, 'form_type', NEW.form_type), 'low', 3::smallint, 'ownereval:' || NEW.id::text || ':u:' || v_rec.auth_user_id::text, COALESCE(NEW.submitted_at, now()), NULL);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.notification_log WHERE user_id = v_rec.auth_user_id AND type = 'owner_employee_evaluation' AND path = v_path) THEN
          INSERT INTO public.notification_log (user_id, type, channel, title, body, path) VALUES (v_rec.auth_user_id, 'owner_employee_evaluation', 'in_app', 'تقييم موظف جديد', v_body, v_path);
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_portal_owners_on_evaluation_submit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_portal_owners_on_evaluation_submit() TO service_role;