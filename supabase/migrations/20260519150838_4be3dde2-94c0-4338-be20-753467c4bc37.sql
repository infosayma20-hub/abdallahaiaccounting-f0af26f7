-- 1) Create employee_allowed_branches (multi-branch attendance whitelist)
CREATE TABLE IF NOT EXISTS public.employee_allowed_branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_eab_employee ON public.employee_allowed_branches(employee_id);
CREATE INDEX IF NOT EXISTS idx_eab_branch ON public.employee_allowed_branches(branch_id);

ALTER TABLE public.employee_allowed_branches ENABLE ROW LEVEL SECURITY;

-- HR/admin can manage rows for employees in their tenant
CREATE POLICY "hr_admin_manage_allowed_branches"
ON public.employee_allowed_branches
FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
  AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_allowed_branches.employee_id AND is_team_member(auth.uid(), e.user_id))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
  AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_allowed_branches.employee_id AND is_team_member(auth.uid(), e.user_id))
);

-- Employee can read their own allowed branches
CREATE POLICY "employee_read_own_allowed_branches"
ON public.employee_allowed_branches
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_allowed_branches.employee_id AND e.auth_user_id = auth.uid())
);

-- 2) Update tenant-match trigger to accept allowed extra branches
CREATE OR REPLACE FUNCTION public.enforce_attendance_tenant_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  emp_owner uuid;
  branch_owner uuid;
  emp_branch uuid;
  allowed_count int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IN ('voided','invalid','rejected','cross_tenant_blocked') THEN
    RETURN NEW;
  END IF;

  IF NEW.branch_id IS NULL OR NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, branch_id INTO emp_owner, emp_branch
  FROM public.employees WHERE id = NEW.employee_id;

  SELECT user_id INTO branch_owner
  FROM public.branches WHERE id = NEW.branch_id;

  IF emp_owner IS NULL OR branch_owner IS NULL THEN
    RAISE EXCEPTION 'Invalid employee or branch reference';
  END IF;

  IF emp_owner <> branch_owner THEN
    RAISE EXCEPTION 'Cross-tenant attendance is not allowed (employee % vs branch %)',
      emp_owner, branch_owner
      USING ERRCODE = 'check_violation';
  END IF;

  -- Allow if branch is the primary, OR is in the allowed branches whitelist
  IF emp_branch IS NOT NULL AND emp_branch <> NEW.branch_id THEN
    SELECT count(*) INTO allowed_count
    FROM public.employee_allowed_branches
    WHERE employee_id = NEW.employee_id AND branch_id = NEW.branch_id;

    IF allowed_count = 0 THEN
      RAISE EXCEPTION 'Employee is not assigned to this branch (not in allowed list)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;