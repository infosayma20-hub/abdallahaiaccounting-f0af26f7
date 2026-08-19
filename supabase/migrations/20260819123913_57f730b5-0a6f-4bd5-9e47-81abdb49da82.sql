CREATE OR REPLACE FUNCTION public.get_form_audience(p_kind text, p_form_key text DEFAULT NULL::text, p_template_id uuid DEFAULT NULL::uuid, p_manager_only boolean DEFAULT false)
 RETURNS TABLE(employee_id uuid, full_name text, job_title text, branch_name text, roles text[], can_fill boolean, can_view boolean, fill_source text, view_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT e.id, e.full_name, e.job_title, e.auth_user_id, e.branch_id, e.is_manager,
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
      CASE
        WHEN p_kind <> 'builtin' THEN false
        WHEN NOT p_manager_only THEN true
        ELSE (
          COALESCE(te.is_manager, false)
          OR EXISTS (
            SELECT 1 FROM public.branch_manager_assignments bma
            WHERE bma.user_id = te.auth_user_id
          )
        )
      END AS default_fill
    FROM tenant_emp te
  )
  SELECT
    c.id,
    c.full_name,
    c.job_title,
    c.branch_name,
    c.roles,
    (c.manual_fill OR c.by_title OR c.default_fill) AS can_fill,
    c.manual_view AS can_view,
    CASE
      WHEN c.default_fill AND p_kind = 'builtin' AND NOT p_manager_only THEN 'default'
      WHEN c.default_fill AND p_kind = 'builtin' THEN 'branch_manager'
      WHEN c.by_title AND c.manual_fill THEN 'both'
      WHEN c.by_title THEN 'job_title'
      WHEN c.manual_fill THEN 'manual'
      ELSE NULL
    END AS fill_source,
    CASE WHEN c.manual_view THEN 'manual' ELSE NULL END AS view_source
  FROM calc c
  ORDER BY (c.manual_fill OR c.manual_view OR c.by_title OR c.default_fill) DESC, c.full_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_form_catalog(p_builtin_keys text[] DEFAULT NULL::text[], p_manager_only_keys text[] DEFAULT NULL::text[])
 RETURNS TABLE(kind text, form_key text, template_id uuid, name text, category text, is_active boolean, fill_count integer, view_count integer, fill_is_default boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid := public.hr_form_admin_owner();
BEGIN
  RETURN QUERY
  WITH tenant_emp AS (
    SELECT e.id, e.job_title, e.auth_user_id, jt.name AS jt_name,
           (COALESCE(e.is_manager, false)
             OR EXISTS (SELECT 1 FROM public.branch_manager_assignments bma WHERE bma.user_id = e.auth_user_id)) AS is_bm
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
      (SELECT COUNT(*)::int FROM tenant_emp te
        WHERE (NOT (k.form_key = ANY(COALESCE(p_manager_only_keys, ARRAY[]::text[]))))
           OR te.is_bm
           OR EXISTS (
             SELECT 1 FROM public.builtin_form_assignments a
             WHERE a.employee_id = te.id AND a.form_key = k.form_key
               AND a.is_active AND a.access_level = 'fill')
      ) AS fill_count,
      (SELECT COUNT(*)::int FROM public.builtin_form_assignments a
        JOIN tenant_emp te ON te.id = a.employee_id
        WHERE a.form_key = k.form_key AND a.is_active AND a.access_level = 'view') AS view_count,
      (NOT (k.form_key = ANY(COALESCE(p_manager_only_keys, ARRAY[]::text[])))) AS fill_is_default
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
      ) AS view_count,
      false AS fill_is_default
    FROM visible_tpl v
  )
  SELECT * FROM builtin_rows
  UNION ALL
  SELECT * FROM tpl_rows
  ORDER BY 1, 4;
END;
$function$;