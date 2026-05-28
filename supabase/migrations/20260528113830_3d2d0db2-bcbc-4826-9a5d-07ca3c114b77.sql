-- Create password reset requests table
CREATE TABLE public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  employee_name TEXT,
  employee_id UUID,
  company_id UUID,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  requester_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT ON public.password_reset_requests TO anon;
GRANT SELECT, INSERT, UPDATE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;

-- Auto-resolve employee_id + company_id from email
CREATE OR REPLACE FUNCTION public.resolve_password_reset_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record RECORD;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id, company_id, full_name INTO emp_record
  FROM public.employees
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;
  IF FOUND THEN
    NEW.employee_id := emp_record.id;
    NEW.company_id := emp_record.company_id;
    IF NEW.employee_name IS NULL OR NEW.employee_name = '' THEN
      NEW.employee_name := emp_record.full_name;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_password_reset_company
BEFORE INSERT OR UPDATE ON public.password_reset_requests
FOR EACH ROW EXECUTE FUNCTION public.resolve_password_reset_company();

-- Enable RLS
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a request
CREATE POLICY "anyone can request password reset"
ON public.password_reset_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Admins/HR can view requests in their company
CREATE POLICY "admins/hr can view requests in their company"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_manager'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Admins/HR can update (resolve) requests
CREATE POLICY "admins/hr can resolve requests"
ON public.password_reset_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_manager'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests(status, created_at DESC);
CREATE INDEX idx_password_reset_requests_company ON public.password_reset_requests(company_id, status);