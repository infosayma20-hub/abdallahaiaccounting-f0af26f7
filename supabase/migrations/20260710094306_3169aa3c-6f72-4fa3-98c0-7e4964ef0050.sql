
-- Tighten RLS on employee advances & loans.
-- Previous policies let any team member (including regular employees) read/write
-- everyone's advances/loans. New rules:
--   • Owner (dataOwner) + admin/super_admin/hr_manager: full manage
--   • Employees: SELECT only their own rows (matched via employees.auth_user_id)

-- Helper: is the caller an HR admin (owner, admin, super_admin, hr_manager)?
CREATE OR REPLACE FUNCTION public.is_hr_admin(_auth_uid uuid, _data_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _auth_uid = _data_owner
    OR public.get_team_owner_id(_auth_uid) = _data_owner
       AND (
         public.has_role(_auth_uid, 'admin'::app_role)
         OR public.has_role(_auth_uid, 'super_admin'::app_role)
         OR public.has_role(_auth_uid, 'hr_manager'::app_role)
       )
    OR public.has_role(_auth_uid, 'admin'::app_role)
    OR public.has_role(_auth_uid, 'super_admin'::app_role)
$$;

-- Helper: does auth user own this employee row?
CREATE OR REPLACE FUNCTION public.is_self_employee(_auth_uid uuid, _employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id AND e.auth_user_id = _auth_uid
  )
$$;

-- ─── employee_advances ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own advances" ON public.employee_advances;

CREATE POLICY "HR admins manage advances"
  ON public.employee_advances
  FOR ALL
  USING (public.is_hr_admin(auth.uid(), user_id))
  WITH CHECK (public.is_hr_admin(auth.uid(), user_id));

CREATE POLICY "Employees read own advances"
  ON public.employee_advances
  FOR SELECT
  USING (public.is_self_employee(auth.uid(), employee_id));

-- ─── employee_advance_installments ─────────────────────────────
DROP POLICY IF EXISTS "Users can manage own installments" ON public.employee_advance_installments;

CREATE POLICY "HR admins manage advance installments"
  ON public.employee_advance_installments
  FOR ALL
  USING (public.is_hr_admin(auth.uid(), user_id))
  WITH CHECK (public.is_hr_admin(auth.uid(), user_id));

CREATE POLICY "Employees read own advance installments"
  ON public.employee_advance_installments
  FOR SELECT
  USING (public.is_self_employee(auth.uid(), employee_id));

-- ─── employee_loans ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their loans" ON public.employee_loans;

CREATE POLICY "HR admins manage loans"
  ON public.employee_loans
  FOR ALL
  USING (public.is_hr_admin(auth.uid(), user_id))
  WITH CHECK (public.is_hr_admin(auth.uid(), user_id));

CREATE POLICY "Employees read own loans"
  ON public.employee_loans
  FOR SELECT
  USING (public.is_self_employee(auth.uid(), employee_id));

-- ─── loan_installments ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their installments" ON public.loan_installments;

CREATE POLICY "HR admins manage loan installments"
  ON public.loan_installments
  FOR ALL
  USING (public.is_hr_admin(auth.uid(), user_id))
  WITH CHECK (public.is_hr_admin(auth.uid(), user_id));

CREATE POLICY "Employees read own loan installments"
  ON public.loan_installments
  FOR SELECT
  USING (public.is_self_employee(auth.uid(), employee_id));
