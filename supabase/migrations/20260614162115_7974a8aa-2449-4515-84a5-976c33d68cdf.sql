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
    );
$$;