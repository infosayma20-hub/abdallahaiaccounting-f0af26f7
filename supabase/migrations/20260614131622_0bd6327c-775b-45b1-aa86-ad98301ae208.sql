
CREATE OR REPLACE FUNCTION public.can_view_form_template(
  _target_employee_ids uuid[],
  _target_job_title_names text[]
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      LEFT JOIN public.job_titles jt ON jt.id = e.job_title_id
      WHERE e.user_id = auth.uid()
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
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_form_template(uuid[], text[]) TO authenticated, service_role;

DROP POLICY IF EXISTS "Anyone can read active system templates" ON public.form_templates;
DROP POLICY IF EXISTS "Team can read company templates" ON public.form_templates;

CREATE POLICY "View targeted system templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  is_system = true
  AND is_active = true
  AND is_deleted = false
  AND public.can_view_form_template(target_employee_ids, target_job_title_names)
);

CREATE POLICY "View targeted company templates"
ON public.form_templates
FOR SELECT
TO authenticated
USING (
  user_id IS NOT NULL
  AND public.is_team_member(auth.uid(), user_id)
  AND public.can_view_form_template(target_employee_ids, target_job_title_names)
);
