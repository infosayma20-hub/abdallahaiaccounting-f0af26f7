
CREATE TABLE public.form_section_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.employee_forms(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.form_templates(id) ON DELETE SET NULL,
  section_key text NOT NULL,
  section_title text NOT NULL,
  assignee_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assignee_auth_user_id uuid,
  assigned_by uuid,
  user_id uuid NOT NULL,
  company_id uuid,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, section_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_section_assignments TO authenticated;
GRANT ALL ON public.form_section_assignments TO service_role;

ALTER TABLE public.form_section_assignments ENABLE ROW LEVEL SECURITY;

-- Tenant owner (account user) — full access
CREATE POLICY "Tenant owner manages section assignments"
ON public.form_section_assignments
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admin / HR manager — full access within their tenant (uses has_role helper)
CREATE POLICY "Admins and HR manage section assignments"
ON public.form_section_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr_manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr_manager')
);

-- Assigned employee — read own assignments
CREATE POLICY "Assignee reads own section assignments"
ON public.form_section_assignments
FOR SELECT
TO authenticated
USING (
  assignee_auth_user_id = auth.uid()
  OR assignee_employee_id IN (
    SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
  )
);

-- Assigned employee — update status/notes on own assignments
CREATE POLICY "Assignee updates own section assignment status"
ON public.form_section_assignments
FOR UPDATE
TO authenticated
USING (
  assignee_auth_user_id = auth.uid()
  OR assignee_employee_id IN (
    SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
  )
)
WITH CHECK (
  assignee_auth_user_id = auth.uid()
  OR assignee_employee_id IN (
    SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
  )
);

-- updated_at trigger
CREATE TRIGGER trg_form_section_assignments_updated_at
BEFORE UPDATE ON public.form_section_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-fill user_id, company_id, assignee_auth_user_id, assigned_by from form/employee context
CREATE OR REPLACE FUNCTION public.set_form_section_assignment_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form_user_id uuid;
  v_form_company_id uuid;
  v_emp_auth uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.company_id IS NULL THEN
    SELECT user_id, company_id INTO v_form_user_id, v_form_company_id
    FROM public.employee_forms WHERE id = NEW.form_id;
    IF NEW.user_id IS NULL THEN NEW.user_id := v_form_user_id; END IF;
    IF NEW.company_id IS NULL THEN NEW.company_id := v_form_company_id; END IF;
  END IF;

  IF NEW.assignee_auth_user_id IS NULL AND NEW.assignee_employee_id IS NOT NULL THEN
    SELECT auth_user_id INTO v_emp_auth FROM public.employees WHERE id = NEW.assignee_employee_id;
    NEW.assignee_auth_user_id := v_emp_auth;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_by IS NULL THEN
    NEW.assigned_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_form_section_assignments_defaults
BEFORE INSERT OR UPDATE ON public.form_section_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_form_section_assignment_defaults();

CREATE INDEX idx_form_section_assignments_form ON public.form_section_assignments(form_id);
CREATE INDEX idx_form_section_assignments_assignee ON public.form_section_assignments(assignee_employee_id);
CREATE INDEX idx_form_section_assignments_user ON public.form_section_assignments(user_id);
