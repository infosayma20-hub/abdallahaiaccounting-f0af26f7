
DO $$ BEGIN
  CREATE TYPE public.employee_form_workflow_status AS ENUM ('draft','submitted','under_review','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employee_form_approver_role AS ENUM ('management','hr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employee_form_share_channel AS ENUM ('whatsapp','management','hr','email');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employee_forms
  ADD COLUMN IF NOT EXISTS workflow_status public.employee_form_workflow_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_approver_role public.employee_form_approver_role,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS company_id UUID;

UPDATE public.employee_forms ef
SET company_id = e.company_id
FROM public.employees e
WHERE ef.employee_id = e.id AND ef.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_forms_workflow_status ON public.employee_forms(workflow_status);
CREATE INDEX IF NOT EXISTS idx_employee_forms_company_id ON public.employee_forms(company_id);

CREATE TABLE IF NOT EXISTS public.employee_form_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.employee_forms(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  shared_by_employee_id UUID REFERENCES public.employees(id),
  shared_by_user_id UUID,
  channel public.employee_form_share_channel NOT NULL,
  recipient TEXT,
  recipient_name TEXT,
  recipient_employee_id UUID REFERENCES public.employees(id),
  pdf_url TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_form_shares TO authenticated;
GRANT ALL ON public.employee_form_shares TO service_role;
ALTER TABLE public.employee_form_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select form shares" ON public.employee_form_shares
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "tenant insert form shares" ON public.employee_form_shares
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_form_shares_form_id ON public.employee_form_shares(form_id);
CREATE INDEX IF NOT EXISTS idx_form_shares_company_id ON public.employee_form_shares(company_id);

CREATE TABLE IF NOT EXISTS public.employee_form_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.employee_forms(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submit','start_review','approve','reject','return','share')),
  actor_user_id UUID,
  actor_employee_id UUID REFERENCES public.employees(id),
  actor_role TEXT,
  from_status public.employee_form_workflow_status,
  to_status public.employee_form_workflow_status,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.employee_form_approvals TO authenticated;
GRANT ALL ON public.employee_form_approvals TO service_role;
ALTER TABLE public.employee_form_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select form approvals" ON public.employee_form_approvals
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "tenant insert form approvals" ON public.employee_form_approvals
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_form_approvals_form_id ON public.employee_form_approvals(form_id);
CREATE INDEX IF NOT EXISTS idx_form_approvals_company_id ON public.employee_form_approvals(company_id);

CREATE OR REPLACE FUNCTION public.log_employee_form_workflow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.workflow_status IS DISTINCT FROM OLD.workflow_status THEN
    IF NEW.workflow_status = 'submitted' AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;
    IF NEW.workflow_status IN ('approved','rejected') AND NEW.reviewed_at IS NULL THEN
      NEW.reviewed_at := now();
    END IF;

    INSERT INTO public.employee_form_approvals
      (form_id, company_id, action, actor_user_id, from_status, to_status, notes)
    VALUES (
      NEW.id,
      COALESCE(NEW.company_id, OLD.company_id),
      CASE NEW.workflow_status
        WHEN 'submitted' THEN 'submit'
        WHEN 'under_review' THEN 'start_review'
        WHEN 'approved' THEN 'approve'
        WHEN 'rejected' THEN 'reject'
        WHEN 'draft' THEN 'return'
        ELSE 'submit'
      END,
      auth.uid(),
      OLD.workflow_status,
      NEW.workflow_status,
      NEW.review_notes
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_employee_form_workflow ON public.employee_forms;
CREATE TRIGGER trg_log_employee_form_workflow
BEFORE UPDATE ON public.employee_forms
FOR EACH ROW EXECUTE FUNCTION public.log_employee_form_workflow_change();

-- Storage policies for employee-form-exports (path: {company_id}/{form_id}/{file})
DROP POLICY IF EXISTS "tenant read form exports" ON storage.objects;
DROP POLICY IF EXISTS "tenant write form exports" ON storage.objects;
DROP POLICY IF EXISTS "tenant update form exports" ON storage.objects;

CREATE POLICY "tenant read form exports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-form-exports'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "tenant write form exports" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-form-exports'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "tenant update form exports" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-form-exports'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );
