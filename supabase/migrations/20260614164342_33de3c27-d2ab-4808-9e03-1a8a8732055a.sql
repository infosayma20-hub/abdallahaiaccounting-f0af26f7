-- 1) New assignments table
CREATE TABLE public.form_template_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('fill','view')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE(template_id, employee_id, access_level)
);

CREATE INDEX idx_fta_employee ON public.form_template_assignments(employee_id) WHERE is_active;
CREATE INDEX idx_fta_template ON public.form_template_assignments(template_id) WHERE is_active;
CREATE INDEX idx_fta_user ON public.form_template_assignments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_template_assignments TO authenticated;
GRANT ALL ON public.form_template_assignments TO service_role;

ALTER TABLE public.form_template_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage form assignments"
ON public.form_template_assignments
FOR ALL
TO authenticated
USING (
  public.is_team_member(auth.uid(), user_id)
  AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'hr_manager'::public.app_role))
)
WITH CHECK (
  public.is_team_member(auth.uid(), user_id)
  AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'hr_manager'::public.app_role))
);

CREATE POLICY "Employees read own assignments"
ON public.form_template_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = form_template_assignments.employee_id
      AND (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
  )
);

-- 2) Drop old policies referencing the old can_view_form_template signature
DROP POLICY IF EXISTS "View targeted company templates" ON public.form_templates;
DROP POLICY IF EXISTS "View targeted system templates" ON public.form_templates;

-- 3) Drop old function and recreate with template_id as first arg
DROP FUNCTION IF EXISTS public.can_view_form_template(uuid[], text[]);

CREATE OR REPLACE FUNCTION public.can_view_form_template(
  _template_id uuid,
  _target_employee_ids uuid[],
  _target_job_title_names text[]
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
      WHERE (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
        AND (
          e.id = ANY(COALESCE(_target_employee_ids, ARRAY[]::uuid[]))
          OR (
            COALESCE(array_length(_target_job_title_names, 1), 0) > 0
            AND (
              lower(btrim(coalesce(e.job_title, ''))) = ANY(
                SELECT lower(btrim(x)) FROM unnest(_target_job_title_names) AS x
              )
              OR lower(btrim(coalesce(jt.name, ''))) = ANY(
                SELECT lower(btrim(x)) FROM unnest(_target_job_title_names) AS x
              )
            )
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.form_template_assignments fta
      JOIN public.employees e2 ON e2.id = fta.employee_id
      WHERE fta.template_id = _template_id
        AND fta.is_active = true
        AND (e2.auth_user_id = auth.uid() OR e2.user_id = auth.uid())
    );
$$;

-- 4) Recreate the form_templates policies using new signature
CREATE POLICY "View targeted company templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  user_id IS NOT NULL
  AND public.is_team_member(auth.uid(), user_id)
  AND public.can_view_form_template(id, target_employee_ids, target_job_title_names)
);

CREATE POLICY "View targeted system templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  is_system = true
  AND is_active = true
  AND is_deleted = false
  AND public.can_view_form_template(id, target_employee_ids, target_job_title_names)
);

-- 5) can_fill_form_template: stricter — only fill-assignment OR job-title match
CREATE OR REPLACE FUNCTION public.can_fill_form_template(_template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH t AS (
    SELECT target_employee_ids, target_job_title_names
    FROM public.form_templates WHERE id = _template_id
  )
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM t
      JOIN public.employees e ON (e.auth_user_id = auth.uid() OR e.user_id = auth.uid())
      LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
      WHERE
        e.id = ANY(COALESCE(t.target_employee_ids, ARRAY[]::uuid[]))
        OR (
          COALESCE(array_length(t.target_job_title_names, 1), 0) > 0
          AND (
            lower(btrim(coalesce(e.job_title, ''))) = ANY(
              SELECT lower(btrim(x)) FROM unnest(t.target_job_title_names) AS x
            )
            OR lower(btrim(coalesce(jt.name, ''))) = ANY(
              SELECT lower(btrim(x)) FROM unnest(t.target_job_title_names) AS x
            )
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.form_template_assignments fta
      JOIN public.employees e2 ON e2.id = fta.employee_id
      WHERE fta.template_id = _template_id
        AND fta.is_active = true
        AND fta.access_level = 'fill'
        AND (e2.auth_user_id = auth.uid() OR e2.user_id = auth.uid())
    );
$$;

-- 6) Trigger: block insert on employee_forms if caller cannot fill
CREATE OR REPLACE FUNCTION public.enforce_form_fill_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.template_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'hr_manager'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NOT public.can_fill_form_template(NEW.template_id) THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعبئة هذا النموذج (اطلاع فقط)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_form_fill_permission_trg ON public.employee_forms;
CREATE TRIGGER enforce_form_fill_permission_trg
  BEFORE INSERT ON public.employee_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_form_fill_permission();

-- 7) RPC for the management screen + portal split
CREATE OR REPLACE FUNCTION public.get_employee_form_access(p_employee_id uuid)
RETURNS TABLE (
  template_id uuid,
  template_name text,
  template_category text,
  template_description text,
  is_system boolean,
  can_fill boolean,
  can_view boolean,
  fill_source text,
  view_source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_caller uuid := auth.uid();
BEGIN
  SELECT user_id INTO v_owner FROM public.employees WHERE id = p_employee_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  -- Caller must be admin/hr_manager of the tenant, OR the employee themselves
  IF NOT (
    public.is_team_member(v_caller, v_owner)
    AND (public.has_role(v_caller,'admin'::public.app_role) OR public.has_role(v_caller,'hr_manager'::public.app_role))
  ) AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = p_employee_id AND (e.auth_user_id = v_caller OR e.user_id = v_caller)
  ) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT e.id, e.job_title, jt.name AS jt_name
    FROM public.employees e
    LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
    WHERE e.id = p_employee_id
  ),
  visible AS (
    SELECT ft.*
    FROM public.form_templates ft
    WHERE ft.is_deleted = false
      AND ft.is_active = true
      AND (
        ft.is_system = true
        OR (ft.user_id IS NOT NULL AND public.is_team_member(v_caller, ft.user_id))
      )
  ),
  matched AS (
    SELECT v.id AS tid,
      EXISTS (
        SELECT 1 FROM emp
        WHERE emp.id = ANY(COALESCE(v.target_employee_ids, ARRAY[]::uuid[]))
          OR (
            COALESCE(array_length(v.target_job_title_names,1),0) > 0
            AND (
              lower(btrim(coalesce(emp.job_title,''))) = ANY(SELECT lower(btrim(x)) FROM unnest(v.target_job_title_names) AS x)
              OR lower(btrim(coalesce(emp.jt_name,''))) = ANY(SELECT lower(btrim(x)) FROM unnest(v.target_job_title_names) AS x)
            )
          )
      ) AS by_title,
      EXISTS (SELECT 1 FROM public.form_template_assignments a WHERE a.template_id=v.id AND a.employee_id=p_employee_id AND a.is_active AND a.access_level='fill') AS manual_fill,
      EXISTS (SELECT 1 FROM public.form_template_assignments a WHERE a.template_id=v.id AND a.employee_id=p_employee_id AND a.is_active AND a.access_level='view') AS manual_view
    FROM visible v
  )
  SELECT
    v.id,
    v.name,
    v.category,
    v.description,
    v.is_system,
    (m.by_title OR m.manual_fill) AS can_fill,
    (m.by_title OR m.manual_fill OR m.manual_view) AS can_view,
    CASE
      WHEN m.by_title AND m.manual_fill THEN 'both'
      WHEN m.by_title THEN 'job_title'
      WHEN m.manual_fill THEN 'manual'
      ELSE NULL
    END AS fill_source,
    CASE
      WHEN m.by_title AND (m.manual_view OR m.manual_fill) THEN 'both'
      WHEN m.by_title THEN 'job_title'
      WHEN m.manual_view OR m.manual_fill THEN 'manual'
      ELSE NULL
    END AS view_source
  FROM visible v
  JOIN matched m ON m.tid = v.id
  ORDER BY v.is_system DESC, v.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_form_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_fill_form_template(uuid) TO authenticated;