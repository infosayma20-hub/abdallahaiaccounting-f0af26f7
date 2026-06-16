GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_forms TO authenticated;
GRANT ALL ON public.employee_forms TO service_role;

UPDATE public.employee_forms ef
SET company_id = e.company_id
FROM public.employees e
WHERE ef.employee_id = e.id
  AND ef.company_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_employee_form_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
BEGIN
  SELECT e.user_id, e.company_id
    INTO v_user_id, v_company_id
  FROM public.employees e
  WHERE e.id = NEW.employee_id;

  NEW.user_id := v_user_id;
  NEW.company_id := COALESCE(NEW.company_id, v_company_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_employee_forms_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_employee_owner boolean := false;
  v_is_team_manager boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = OLD.employee_id
      AND (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
  ) INTO v_is_employee_owner;

  v_is_team_manager := public.is_team_member(auth.uid(), OLD.user_id);

  IF v_is_employee_owner AND NOT v_is_team_manager THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'لا يمكن للموظف تغيير قرار الطلب';
    END IF;

    IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.review_notes IS DISTINCT FROM OLD.review_notes THEN
      RAISE EXCEPTION 'لا يمكن للموظف تعديل بيانات المراجعة';
    END IF;

    IF NEW.workflow_status IS DISTINCT FROM OLD.workflow_status
       AND NOT (OLD.workflow_status = 'draft'::public.employee_form_workflow_status
                AND NEW.workflow_status = 'submitted'::public.employee_form_workflow_status) THEN
      RAISE EXCEPTION 'لا يمكن تغيير حالة الاعتماد إلا للإرسال للمراجعة';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_guard_employee_forms_self_update ON public.employee_forms;
CREATE TRIGGER aaa_guard_employee_forms_self_update
BEFORE UPDATE ON public.employee_forms
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_forms_self_update();

DROP POLICY IF EXISTS "Employees can update own forms" ON public.employee_forms;
CREATE POLICY "Employees can update own forms" ON public.employee_forms
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_forms.employee_id
      AND (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = employee_forms.employee_id
      AND (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.can_access_employee_form_export(_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_parts text[];
  v_company_id uuid;
  v_form_id uuid;
BEGIN
  v_parts := storage.foldername(_object_name);
  IF array_length(v_parts, 1) < 2 THEN
    RETURN false;
  END IF;

  BEGIN
    v_company_id := v_parts[1]::uuid;
    v_form_id := v_parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1
    FROM public.employee_forms ef
    JOIN public.employees e ON e.id = ef.employee_id
    WHERE ef.id = v_form_id
      AND COALESCE(ef.company_id, e.company_id) = v_company_id
      AND (
        public.is_team_member(auth.uid(), ef.user_id)
        OR e.auth_user_id = auth.uid()
        OR e.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.form_template_assignments fta
          JOIN public.employees viewer ON viewer.id = fta.employee_id
          WHERE fta.template_id = ef.template_id
            AND fta.is_active = true
            AND (viewer.auth_user_id = auth.uid() OR viewer.user_id = auth.uid())
        )
      )
  );
END;
$$;

DROP POLICY IF EXISTS "tenant read form exports" ON storage.objects;
DROP POLICY IF EXISTS "tenant write form exports" ON storage.objects;
DROP POLICY IF EXISTS "tenant update form exports" ON storage.objects;

CREATE POLICY "tenant read form exports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-form-exports'
    AND public.can_access_employee_form_export(name)
  );

CREATE POLICY "tenant write form exports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-form-exports'
    AND public.can_access_employee_form_export(name)
  );

CREATE POLICY "tenant update form exports" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-form-exports'
    AND public.can_access_employee_form_export(name)
  )
  WITH CHECK (
    bucket_id = 'employee-form-exports'
    AND public.can_access_employee_form_export(name)
  );