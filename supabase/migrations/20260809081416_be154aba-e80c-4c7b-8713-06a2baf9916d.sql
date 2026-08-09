-- 1) Complaint routing target
ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS complaint_target text;

ALTER TABLE public.employee_forms
  DROP CONSTRAINT IF EXISTS employee_forms_complaint_target_check;
ALTER TABLE public.employee_forms
  ADD CONSTRAINT employee_forms_complaint_target_check
  CHECK (complaint_target IS NULL OR complaint_target IN ('executive','hr'));

-- 2) HR permissions for complaints
ALTER TABLE public.hr_manager_permissions
  ADD COLUMN IF NOT EXISTS can_view_complaints boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_executive_complaints boolean NOT NULL DEFAULT false;

-- 3) Gate function (security definer, avoids recursion)
CREATE OR REPLACE FUNCTION public.can_view_complaint_row(_uid uuid, _form_type text, _target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_form_type,'') <> 'complaints' THEN true
    WHEN public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'super_admin'::app_role) THEN true
    WHEN COALESCE(_target,'executive') = 'hr' THEN EXISTS (
      SELECT 1 FROM public.hr_manager_permissions p
      WHERE p.hr_auth_id = _uid
        AND COALESCE(p.is_active, true) = true
        AND p.can_view_complaints = true
    )
    ELSE EXISTS (
      SELECT 1 FROM public.hr_manager_permissions p
      WHERE p.hr_auth_id = _uid
        AND COALESCE(p.is_active, true) = true
        AND p.can_view_executive_complaints = true
    )
  END
$$;

-- 4) Tighten SELECT policies on employee_forms
DROP POLICY IF EXISTS "Employees can view own forms" ON public.employee_forms;
CREATE POLICY "Employees can view own forms"
ON public.employee_forms
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_forms.employee_id
      AND e.auth_user_id = (SELECT auth.uid())
  )
  OR (
    public.is_team_member((SELECT auth.uid()), user_id)
    AND public.can_view_complaint_row((SELECT auth.uid()), form_type, complaint_target)
  )
);

DROP POLICY IF EXISTS "HR managers can view all company forms" ON public.employee_forms;
CREATE POLICY "HR managers can view all company forms"
ON public.employee_forms
FOR SELECT
USING (
  public.has_role((SELECT auth.uid()), 'hr_manager'::app_role)
  AND public.is_team_member((SELECT auth.uid()), user_id)
  AND public.can_view_complaint_row((SELECT auth.uid()), form_type, complaint_target)
);

DROP POLICY IF EXISTS "Branch managers can view forms in their branches" ON public.employee_forms;
CREATE POLICY "Branch managers can view forms in their branches"
ON public.employee_forms
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.branch_manager_assignments bma
      ON bma.branch_id = e.branch_id AND bma.user_id = (SELECT auth.uid())
    WHERE e.id = employee_forms.employee_id
  )
  AND public.can_view_complaint_row((SELECT auth.uid()), form_type, complaint_target)
);

DROP POLICY IF EXISTS "Assigned viewers can read template submissions" ON public.employee_forms;
CREATE POLICY "Assigned viewers can read template submissions"
ON public.employee_forms
FOR SELECT
USING (
  template_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.form_template_assignments fta
    JOIN public.employees e ON e.id = fta.employee_id
    WHERE fta.template_id = employee_forms.template_id
      AND fta.is_active = true
      AND (e.auth_user_id = (SELECT auth.uid()) OR e.user_id = (SELECT auth.uid()))
  )
  AND public.can_view_complaint_row((SELECT auth.uid()), form_type, complaint_target)
);