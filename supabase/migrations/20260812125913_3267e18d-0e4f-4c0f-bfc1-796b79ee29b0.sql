CREATE TABLE public.employee_form_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.employee_forms(id) ON DELETE CASCADE,
  employee_id uuid,
  user_id uuid,
  company_id uuid,
  action text NOT NULL,
  old_status text,
  new_status text,
  old_workflow_status text,
  new_workflow_status text,
  notes text,
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_efal_form_id ON public.employee_form_audit_log(form_id, created_at DESC);
CREATE INDEX idx_efal_employee_id ON public.employee_form_audit_log(employee_id);
CREATE INDEX idx_efal_user_id ON public.employee_form_audit_log(user_id);

GRANT SELECT ON public.employee_form_audit_log TO authenticated;
GRANT ALL ON public.employee_form_audit_log TO service_role;

ALTER TABLE public.employee_form_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_scoped" ON public.employee_form_audit_log
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR user_id = public.get_team_owner_id()
  OR employee_id IN (SELECT e.id FROM public.employees e WHERE e.auth_user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.log_employee_form_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text;
  v_email text;
  v_role text;
  v_action text;
  v_notes text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.workflow_status = 'submitted' THEN 'submitted' ELSE 'created' END;
  ELSE
    IF NEW.final_decided_at IS DISTINCT FROM OLD.final_decided_at AND NEW.final_decided_at IS NOT NULL THEN
      v_action := 'final_decision';
      v_notes := NEW.final_decision_notes;
      v_actor := COALESCE(NEW.final_decided_by, v_actor);
    ELSIF NEW.hr_reviewed_at IS DISTINCT FROM OLD.hr_reviewed_at AND NEW.hr_reviewed_at IS NOT NULL THEN
      v_action := 'hr_recommendation_' || COALESCE(NEW.hr_recommendation, 'none');
      v_notes := NEW.hr_recommendation_notes;
      v_actor := COALESCE(NEW.hr_reviewed_by, v_actor);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action := NEW.status;
      v_notes := NEW.review_notes;
      v_actor := COALESCE(NEW.reviewed_by, v_actor);
    ELSIF NEW.workflow_status IS DISTINCT FROM OLD.workflow_status THEN
      v_action := 'workflow_' || NEW.workflow_status::text;
      v_notes := NEW.review_notes;
    ELSIF NEW.management_seen_at IS DISTINCT FROM OLD.management_seen_at AND NEW.management_seen_at IS NOT NULL THEN
      v_action := 'management_seen';
      v_actor := COALESCE(NEW.management_seen_by, v_actor);
    ELSIF NEW.employee_acknowledged_at IS DISTINCT FROM OLD.employee_acknowledged_at AND NEW.employee_acknowledged_at IS NOT NULL THEN
      v_action := 'employee_acknowledged';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT COALESCE(NULLIF(p.full_name, ''), NULLIF(p.display_name, ''))
      INTO v_name
    FROM public.profiles p WHERE p.user_id = v_actor LIMIT 1;

    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_actor LIMIT 1;

    SELECT ur.role::text INTO v_role
    FROM public.user_roles ur WHERE ur.user_id = v_actor
    ORDER BY CASE ur.role::text
      WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 WHEN 'hr_manager' THEN 3 ELSE 9 END
    LIMIT 1;
  END IF;

  INSERT INTO public.employee_form_audit_log (
    form_id, employee_id, user_id, company_id, action,
    old_status, new_status, old_workflow_status, new_workflow_status,
    notes, actor_id, actor_name, actor_email, actor_role
  ) VALUES (
    NEW.id, NEW.employee_id, NEW.user_id, NEW.company_id, v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.workflow_status::text END, NEW.workflow_status::text,
    v_notes, v_actor, v_name, v_email, v_role
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_employee_form_action ON public.employee_forms;
CREATE TRIGGER trg_log_employee_form_action
AFTER INSERT OR UPDATE ON public.employee_forms
FOR EACH ROW EXECUTE FUNCTION public.log_employee_form_action();

INSERT INTO public.employee_form_audit_log (
  form_id, employee_id, user_id, company_id, action, new_status, notes,
  actor_id, actor_name, actor_email, created_at, metadata
)
SELECT f.id, f.employee_id, f.user_id, f.company_id,
       f.status, f.status, f.review_notes,
       f.reviewed_by,
       COALESCE(NULLIF(p.full_name, ''), NULLIF(p.display_name, '')),
       u.email,
       f.reviewed_at,
       '{"backfilled": true}'::jsonb
FROM public.employee_forms f
LEFT JOIN public.profiles p ON p.user_id = f.reviewed_by
LEFT JOIN auth.users u ON u.id = f.reviewed_by
WHERE f.reviewed_at IS NOT NULL;