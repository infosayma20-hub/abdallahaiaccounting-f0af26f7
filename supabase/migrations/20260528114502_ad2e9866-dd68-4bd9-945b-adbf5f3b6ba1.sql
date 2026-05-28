-- 1) Tighten the trigger: reject if email is not linked to any employee/company
CREATE OR REPLACE FUNCTION public.resolve_password_reset_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record RECORD;
BEGIN
  IF NEW.email IS NULL OR length(trim(NEW.email)) = 0 THEN
    RAISE EXCEPTION 'البريد الإلكتروني مطلوب';
  END IF;

  SELECT id, company_id, full_name INTO emp_record
  FROM public.employees
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF NOT FOUND OR emp_record.company_id IS NULL THEN
    RAISE EXCEPTION 'البريد الإلكتروني غير مرتبط بأي موظف في النظام. تواصل مع إدارة شركتك.';
  END IF;

  NEW.employee_id := emp_record.id;
  NEW.company_id  := emp_record.company_id;
  IF NEW.employee_name IS NULL OR NEW.employee_name = '' THEN
    NEW.employee_name := emp_record.full_name;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2) Replace SELECT policy: scope by company (super_admin sees all)
DROP POLICY IF EXISTS "admins/hr can view requests in their company" ON public.password_reset_requests;
CREATE POLICY "admins/hr can view requests in their company"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
    AND company_id = public.get_team_owner_id(auth.uid())
  )
);

-- 3) Replace UPDATE policy: same scoping
DROP POLICY IF EXISTS "admins/hr can resolve requests" ON public.password_reset_requests;
CREATE POLICY "admins/hr can resolve requests"
ON public.password_reset_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
    AND company_id = public.get_team_owner_id(auth.uid())
  )
);