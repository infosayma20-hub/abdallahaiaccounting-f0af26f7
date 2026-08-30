CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  company_id uuid,
  doc_type text NOT NULL CHECK (doc_type IN ('id_card_front','id_card_appendix','photo','contract','cv','qualification','passport','other')),
  title text,
  file_path text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid,
  uploaded_by_role text NOT NULL DEFAULT 'hr' CHECK (uploaded_by_role IN ('employee','hr')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_documents_employee ON public.employee_documents(employee_id);
CREATE INDEX idx_employee_documents_owner ON public.employee_documents(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_own_employee_row(_user_id uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND (e.auth_user_id = _user_id OR e.user_id = _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_employee_documents(_user_id uuid, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_team_member(_user_id, _owner_id)
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'super_admin'::app_role)
      OR public.has_role(_user_id, 'hr_manager'::app_role)
    )
$$;

CREATE POLICY "HR and admins manage team employee documents"
ON public.employee_documents FOR ALL TO authenticated
USING (public.can_manage_employee_documents((SELECT auth.uid()), owner_id))
WITH CHECK (public.can_manage_employee_documents((SELECT auth.uid()), owner_id));

CREATE POLICY "Employees can view their own documents"
ON public.employee_documents FOR SELECT TO authenticated
USING (public.is_own_employee_row((SELECT auth.uid()), employee_id));

CREATE POLICY "Employees can upload their own documents"
ON public.employee_documents FOR INSERT TO authenticated
WITH CHECK (
  public.is_own_employee_row((SELECT auth.uid()), employee_id)
  AND uploaded_by_role = 'employee'
  AND uploaded_by = (SELECT auth.uid())
);

CREATE POLICY "Employees can delete their own uploads"
ON public.employee_documents FOR DELETE TO authenticated
USING (
  public.is_own_employee_row((SELECT auth.uid()), employee_id)
  AND uploaded_by_role = 'employee'
);

CREATE TRIGGER trg_employee_documents_updated_at
BEFORE UPDATE ON public.employee_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();