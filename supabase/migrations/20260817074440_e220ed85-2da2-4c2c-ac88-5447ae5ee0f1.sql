CREATE TABLE public.employee_form_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.employee_forms(id) ON DELETE CASCADE,
  assignee_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assignee_auth_user_id uuid,
  assigned_by uuid,
  assigned_by_name text,
  note text,
  status text NOT NULL DEFAULT 'pending',
  response_notes text,
  completed_at timestamptz,
  user_id uuid,
  company_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_form_referrals_status_chk CHECK (status IN ('pending','in_progress','done','cancelled'))
);

CREATE INDEX idx_efr_form ON public.employee_form_referrals(form_id);
CREATE INDEX idx_efr_assignee ON public.employee_form_referrals(assignee_employee_id, status);
CREATE INDEX idx_efr_user ON public.employee_form_referrals(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_form_referrals TO authenticated;
GRANT ALL ON public.employee_form_referrals TO service_role;

CREATE OR REPLACE FUNCTION public.set_employee_form_referral_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_emp_auth uuid;
BEGIN
  IF NEW.user_id IS NULL OR NEW.company_id IS NULL THEN
    SELECT user_id, company_id INTO v_user_id, v_company_id
    FROM public.employee_forms WHERE id = NEW.form_id;
    IF NEW.user_id IS NULL THEN NEW.user_id := v_user_id; END IF;
    IF NEW.company_id IS NULL THEN NEW.company_id := v_company_id; END IF;
  END IF;

  IF NEW.assignee_auth_user_id IS NULL THEN
    SELECT auth_user_id INTO v_emp_auth FROM public.employees WHERE id = NEW.assignee_employee_id;
    NEW.assignee_auth_user_id := v_emp_auth;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.assigned_by IS NULL THEN
    NEW.assigned_by := auth.uid();
  END IF;

  IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_efr_defaults
BEFORE INSERT OR UPDATE ON public.employee_form_referrals
FOR EACH ROW EXECUTE FUNCTION public.set_employee_form_referral_defaults();

ALTER TABLE public.employee_form_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and HR manage form referrals"
ON public.employee_form_referrals
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role));

CREATE POLICY "Tenant owner manages form referrals"
ON public.employee_form_referrals
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Assignee reads own form referrals"
ON public.employee_form_referrals
FOR SELECT
TO authenticated
USING (
  assignee_auth_user_id = auth.uid()
  OR assignee_employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
);

CREATE POLICY "Assignee updates own form referrals"
ON public.employee_form_referrals
FOR UPDATE
TO authenticated
USING (
  assignee_auth_user_id = auth.uid()
  OR assignee_employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
)
WITH CHECK (
  assignee_auth_user_id = auth.uid()
  OR assignee_employee_id IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid())
);