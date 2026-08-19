-- ============================================================
-- Unified "form audience" layer (form-centric assignment)
-- ============================================================

CREATE OR REPLACE FUNCTION public.hr_form_admin_owner()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner  uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  v_owner := public.get_team_owner_id();
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF NOT (
    public.has_role(v_caller, 'admin'::public.app_role)
    OR public.has_role(v_caller, 'super_admin'::public.app_role)
    OR public.has_role(v_caller, 'hr_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  RETURN v_owner;
END;
$$;

-- ---------- Catalog: all forms + audience counts ----------
CREATE OR REPLACE FUNCTION public.get_form_catalog(p_builtin_keys text[] DEFAULT NULL)
RETURNS TABLE(
  kind text,
  form_key text,
  template_id uuid,
  name text,
  category text,
  is_active boolean,
  fill_count integer,
  view_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := public.hr_form_admin_owner();
BEGIN
  RETURN QUERY
  WITH tenant_emp AS (
    SELECT e.id, e.job_title, e.auth_user_id, jt.name AS jt_name
    FROM public.employees e
    LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
    WHERE e.user_id = v_owner AND e.is_active = true
  ),
  keys AS (
    SELECT DISTINCT k AS form_key
    FROM (
      SELECT unnest(COALESCE(p_builtin_keys, ARRAY[]::text[])) AS k
      UNION
      SELECT bfa.form_key FROM public.builtin_form_assignments bfa
      JOIN tenant_emp te ON te.id = bfa.employee_id
      UNION
      SELECT bfs.form_key FROM public.builtin_form_settings bfs WHERE bfs.user_id = v_owner
    ) s
    WHERE k IS NOT NULL
  ),
  builtin_rows AS (
    SELECT
      'builtin'::text AS kind,
      k.form_key,
      NULL::uuid AS template_id,
      COALESCE(bfs.label_override, k.form_key) AS name,
      'مدمج'::text AS category,
      COALESCE(bfs.is_enabled, true) AS is_active,
      (SELECT COUNT(*)::int FROM public.builtin_form_assignments a
        JOIN tenant_emp te ON te.id = a.employee_id
        WHERE a.form_key = k.form_key AND a.is_active AND a.access_level = 'fill') AS fill_count,
      (SELECT COUNT(*)::int FROM public.builtin_form_assignments a
        JOIN tenant_emp te ON te.id = a.employee_id
        WHERE a.form_key = k.form_key AND a.is_active AND a.access_level = 'view') AS view_count
    FROM keys k
    LEFT JOIN public.builtin_form_settings bfs
      ON bfs.form_key = k.form_key AND bfs.user_id = v_owner
  ),
  visible_tpl AS (
    SELECT ft.*
    FROM public.form_templates ft
    WHERE ft.is_deleted = false
      AND (ft.is_system = true OR ft.user_id = v_owner)
  ),
  tpl_rows AS (
    SELECT
      'template'::text AS kind,
      NULL::text AS form_key,
      v.id AS template_id,
      v.name,
      COALESCE(v.category, 'قالب') AS category,
      v.is_active,
      (SELECT COUNT(*)::int FROM tenant_emp te
        WHERE EXISTS (
          SELECT 1 FROM public.form_template_assignments a
          WHERE a.template_id = v.id AND a.employee_id = te.id
            AND a.is_active AND a.access_level = 'fill'
        )
        OR te.id = ANY(COALESCE(v.target_employee_ids, ARRAY[]::uuid[]))
        OR (
          COALESCE(array_length(v.target_job_title_names, 1), 0) > 0
          AND (
            lower(btrim(COALESCE(te.job_title, ''))) = ANY(SELECT lower(btrim(x)) FROM unnest(v.target_job_title_names) x)
            OR lower(btrim(COALESCE(te.jt_name, ''))) = ANY(SELECT lower(btrim(x)) FROM unnest(v.target_job_title_names) x)
          )
        )
      ) AS fill_count,
      (SELECT COUNT(*)::int FROM tenant_emp te
        WHERE EXISTS (
          SELECT 1 FROM public.form_template_assignments a
          WHERE a.template_id = v.id AND a.employee_id = te.id
            AND a.is_active AND a.access_level = 'view'
        )
      ) AS view_count
    FROM visible_tpl v
  )
  SELECT * FROM builtin_rows
  UNION ALL
  SELECT * FROM tpl_rows
  ORDER BY 1, 4;
END;
$$;

-- ---------- Audience of a single form ----------
CREATE OR REPLACE FUNCTION public.get_form_audience(
  p_kind text,
  p_form_key text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL
)
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  job_title text,
  branch_name text,
  roles text[],
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
  v_owner uuid := public.hr_form_admin_owner();
BEGIN
  IF p_kind NOT IN ('builtin', 'template') THEN
    RAISE EXCEPTION 'نوع النموذج غير صالح';
  END IF;
  IF p_kind = 'builtin' AND p_form_key IS NULL THEN
    RAISE EXCEPTION 'مفتاح النموذج مطلوب';
  END IF;
  IF p_kind = 'template' AND p_template_id IS NULL THEN
    RAISE EXCEPTION 'معرّف القالب مطلوب';
  END IF;

  RETURN QUERY
  WITH tenant_emp AS (
    SELECT e.id, e.full_name, e.job_title, e.auth_user_id, e.branch_id,
           jt.name AS jt_name, b.name AS branch_name
    FROM public.employees e
    LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
    LEFT JOIN public.branches b ON b.id = e.branch_id
    WHERE e.user_id = v_owner AND e.is_active = true
  ),
  tpl AS (
    SELECT ft.* FROM public.form_templates ft
    WHERE p_kind = 'template' AND ft.id = p_template_id
      AND (ft.is_system = true OR ft.user_id = v_owner)
  ),
  calc AS (
    SELECT
      te.id,
      te.full_name,
      te.job_title,
      te.branch_name,
      COALESCE(
        (SELECT array_agg(DISTINCT ur.role::text) FROM public.user_roles ur WHERE ur.user_id = te.auth_user_id),
        ARRAY[]::text[]
      ) AS roles,
      CASE WHEN p_kind = 'builtin' THEN EXISTS (
        SELECT 1 FROM public.builtin_form_assignments a
        WHERE a.employee_id = te.id AND a.form_key = p_form_key
          AND a.is_active AND a.access_level = 'fill')
      ELSE EXISTS (
        SELECT 1 FROM public.form_template_assignments a
        WHERE a.employee_id = te.id AND a.template_id = p_template_id
          AND a.is_active AND a.access_level = 'fill')
      END AS manual_fill,
      CASE WHEN p_kind = 'builtin' THEN EXISTS (
        SELECT 1 FROM public.builtin_form_assignments a
        WHERE a.employee_id = te.id AND a.form_key = p_form_key
          AND a.is_active AND a.access_level = 'view')
      ELSE EXISTS (
        SELECT 1 FROM public.form_template_assignments a
        WHERE a.employee_id = te.id AND a.template_id = p_template_id
          AND a.is_active AND a.access_level = 'view')
      END AS manual_view,
      CASE WHEN p_kind = 'template' THEN EXISTS (
        SELECT 1 FROM tpl v
        WHERE te.id = ANY(COALESCE(v.target_employee_ids, ARRAY[]::uuid[]))
          OR (
            COALESCE(array_length(v.target_job_title_names, 1), 0) > 0
            AND (
              lower(btrim(COALESCE(te.job_title, ''))) = ANY(SELECT lower(btrim(x)) FROM unnest(v.target_job_title_names) x)
              OR lower(btrim(COALESCE(te.jt_name, ''))) = ANY(SELECT lower(btrim(x)) FROM unnest(v.target_job_title_names) x)
            )
          )
      ) ELSE false END AS by_title,
      CASE WHEN p_kind = 'builtin' THEN EXISTS (
        SELECT 1 FROM public.branch_manager_assignments bma
        WHERE bma.user_id = te.auth_user_id
      ) ELSE false END AS is_branch_manager
    FROM tenant_emp te
  )
  SELECT
    c.id,
    c.full_name,
    c.job_title,
    c.branch_name,
    c.roles,
    (c.manual_fill OR c.by_title) AS can_fill,
    (c.manual_fill OR c.manual_view OR c.by_title) AS can_view,
    CASE
      WHEN c.by_title AND c.manual_fill THEN 'both'
      WHEN c.by_title THEN 'job_title'
      WHEN c.manual_fill THEN 'manual'
      ELSE NULL
    END AS fill_source,
    CASE
      WHEN c.by_title AND (c.manual_view OR c.manual_fill) THEN 'both'
      WHEN c.by_title THEN 'job_title'
      WHEN c.manual_view OR c.manual_fill THEN 'manual'
      ELSE NULL
    END AS view_source
  FROM calc c
  ORDER BY (c.manual_fill OR c.manual_view OR c.by_title) DESC, c.full_name;
END;
$$;

-- ---------- Bulk grant / revoke ----------
CREATE OR REPLACE FUNCTION public.set_form_access(
  p_kind text,
  p_level text,
  p_enabled boolean,
  p_employee_ids uuid[],
  p_form_key text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner  uuid := public.hr_form_admin_owner();
  v_caller uuid := auth.uid();
  v_ids    uuid[];
  v_count  integer := 0;
BEGIN
  IF p_kind NOT IN ('builtin', 'template') THEN
    RAISE EXCEPTION 'نوع النموذج غير صالح';
  END IF;
  IF p_level NOT IN ('fill', 'view') THEN
    RAISE EXCEPTION 'مستوى الصلاحية غير صالح';
  END IF;

  -- Only employees that belong to the caller's tenant
  SELECT COALESCE(array_agg(e.id), ARRAY[]::uuid[]) INTO v_ids
  FROM public.employees e
  WHERE e.user_id = v_owner AND e.id = ANY(COALESCE(p_employee_ids, ARRAY[]::uuid[]));

  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF p_kind = 'builtin' THEN
    IF p_form_key IS NULL THEN RAISE EXCEPTION 'مفتاح النموذج مطلوب'; END IF;
    IF p_enabled THEN
      INSERT INTO public.builtin_form_assignments (user_id, employee_id, form_key, access_level, assigned_by, is_active)
      SELECT v_owner, x, p_form_key, p_level, v_caller, true FROM unnest(v_ids) x
      ON CONFLICT (employee_id, form_key, access_level)
      DO UPDATE SET is_active = true, assigned_by = v_caller, updated_at = now();
    ELSE
      DELETE FROM public.builtin_form_assignments
      WHERE form_key = p_form_key AND access_level = p_level AND employee_id = ANY(v_ids);
    END IF;
  ELSE
    IF p_template_id IS NULL THEN RAISE EXCEPTION 'معرّف القالب مطلوب'; END IF;
    IF p_enabled THEN
      INSERT INTO public.form_template_assignments (user_id, template_id, employee_id, access_level, assigned_by, is_active)
      SELECT v_owner, p_template_id, x, p_level, v_caller, true FROM unnest(v_ids) x
      ON CONFLICT (template_id, employee_id, access_level)
      DO UPDATE SET is_active = true, assigned_by = v_caller;
    ELSE
      DELETE FROM public.form_template_assignments
      WHERE template_id = p_template_id AND access_level = p_level AND employee_id = ANY(v_ids);
    END IF;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_form_catalog(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_form_audience(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_form_access(text, text, boolean, uuid[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_form_admin_owner() TO authenticated;