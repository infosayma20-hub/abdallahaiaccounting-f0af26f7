
CREATE TABLE IF NOT EXISTS public.employee_allowed_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_eab_employee ON public.employee_allowed_branches(employee_id);
CREATE INDEX IF NOT EXISTS idx_eab_branch ON public.employee_allowed_branches(branch_id);

ALTER TABLE public.employee_allowed_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages employee_allowed_branches"
ON public.employee_allowed_branches
FOR ALL
USING (
  user_id = public.get_team_owner_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_id = public.get_team_owner_id(auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Employee reads own allowed branches"
ON public.employee_allowed_branches
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_allowed_branches.employee_id
      AND e.auth_user_id = auth.uid()
  )
);
