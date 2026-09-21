-- Confidential form subjects: forms submitted by a listed employee are visible
-- only to the company owner/admins, the employee themselves, and an explicit
-- allow-list of viewer auth accounts. Enforced as RESTRICTIVE policies so it
-- ANDs on top of every existing permissive policy on employee_forms.

CREATE TABLE IF NOT EXISTS public.employee_form_privacy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  allowed_viewer_auth_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_form_privacy_rules_employee_unique UNIQUE (employee_id)
);

GRANT SELECT ON public.employee_form_privacy_rules TO authenticated;
GRANT ALL ON public.employee_form_privacy_rules TO service_role;

ALTER TABLE public.employee_form_privacy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can read privacy rules"
  ON public.employee_form_privacy_rules FOR SELECT
  TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "Admins manage privacy rules"
  ON public.employee_form_privacy_rules FOR ALL
  TO authenticated
  USING (
    public.is_team_member((SELECT auth.uid()), user_id)
    AND (
      (SELECT auth.uid()) = user_id
      OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    public.is_team_member((SELECT auth.uid()), user_id)
    AND (
      (SELECT auth.uid()) = user_id
      OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.employee_form_privacy_allows(
  _viewer uuid,
  _employee_id uuid,
  _owner uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    _viewer IS NULL
    OR _employee_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.employee_form_privacy_rules r
      WHERE r.employee_id = _employee_id AND r.is_active = true
    )
    OR _viewer = _owner
    OR public.has_role(_viewer, 'admin'::app_role)
    OR public.has_role(_viewer, 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = _employee_id
        AND (e.auth_user_id = _viewer OR e.user_id = _viewer)
    )
    OR EXISTS (
      SELECT 1 FROM public.employee_form_privacy_rules r
      WHERE r.employee_id = _employee_id
        AND r.is_active = true
        AND _viewer = ANY (r.allowed_viewer_auth_ids)
    )
$$;

CREATE POLICY "Confidential forms select guard"
  ON public.employee_forms AS RESTRICTIVE FOR SELECT
  TO authenticated
  USING (public.employee_form_privacy_allows((SELECT auth.uid()), employee_id, user_id));

CREATE POLICY "Confidential forms update guard"
  ON public.employee_forms AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING (public.employee_form_privacy_allows((SELECT auth.uid()), employee_id, user_id));

CREATE POLICY "Confidential forms delete guard"
  ON public.employee_forms AS RESTRICTIVE FOR DELETE
  TO authenticated
  USING (public.employee_form_privacy_allows((SELECT auth.uid()), employee_id, user_id));
