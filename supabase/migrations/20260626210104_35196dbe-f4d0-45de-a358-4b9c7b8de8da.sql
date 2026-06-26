
-- Sparta HR module

CREATE TABLE IF NOT EXISTS public.sparta_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.sparta_departments(id) ON DELETE SET NULL,
  manager_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_departments TO authenticated;
GRANT ALL ON public.sparta_departments TO service_role;
ALTER TABLE public.sparta_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_dept_sel ON public.sparta_departments FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_dept_ins ON public.sparta_departments FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_dept_upd ON public.sparta_departments FOR UPDATE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_dept_del ON public.sparta_departments FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  code text,
  full_name text NOT NULL,
  national_id text,
  phone text,
  email text,
  hire_date date,
  job_title text,
  department_id uuid REFERENCES public.sparta_departments(id) ON DELETE SET NULL,
  branch text,
  employment_type text NOT NULL DEFAULT 'full' CHECK (employment_type IN ('full','part','contract','intern')),
  basic_salary numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','onleave','terminated')),
  bank_info jsonb DEFAULT '{}'::jsonb,
  notes text,
  user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sparta_emp_company ON public.sparta_employees(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_employees TO authenticated;
GRANT ALL ON public.sparta_employees TO service_role;
ALTER TABLE public.sparta_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_emp_sel ON public.sparta_employees FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_emp_ins ON public.sparta_employees FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_emp_upd ON public.sparta_employees FOR UPDATE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_emp_del ON public.sparta_employees FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  work_hours numeric(6,2) DEFAULT 0,
  late_minutes integer DEFAULT 0,
  overtime_hours numeric(6,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','leave','holiday','weekend')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_sparta_att_cd ON public.sparta_attendance(company_id,date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_attendance TO authenticated;
GRANT ALL ON public.sparta_attendance TO service_role;
ALTER TABLE public.sparta_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_att_sel ON public.sparta_attendance FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_att_ins ON public.sparta_attendance FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_att_upd ON public.sparta_attendance FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_att_del ON public.sparta_attendance FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('annual','sick','unpaid','emergency','other')),
  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric(5,2) NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_leaves TO authenticated;
GRANT ALL ON public.sparta_leaves TO service_role;
ALTER TABLE public.sparta_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_lv_sel ON public.sparta_leaves FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_lv_ins ON public.sparta_leaves FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_lv_upd ON public.sparta_leaves FOR UPDATE TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_lv_del ON public.sparta_leaves FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  total_gross numeric(14,2) DEFAULT 0,
  total_deductions numeric(14,2) DEFAULT 0,
  total_net numeric(14,2) DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  notes text,
  posted_at timestamptz,
  posted_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_payroll_runs TO authenticated;
GRANT ALL ON public.sparta_payroll_runs TO service_role;
ALTER TABLE public.sparta_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_pr_sel ON public.sparta_payroll_runs FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_pr_ins ON public.sparta_payroll_runs FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_pr_upd ON public.sparta_payroll_runs FOR UPDATE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_pr_del ON public.sparta_payroll_runs FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES public.sparta_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE RESTRICT,
  basic numeric(14,2) NOT NULL DEFAULT 0,
  allowances jsonb DEFAULT '[]'::jsonb,
  deductions jsonb DEFAULT '[]'::jsonb,
  overtime_amount numeric(14,2) DEFAULT 0,
  advances_deducted numeric(14,2) DEFAULT 0,
  gross numeric(14,2) NOT NULL DEFAULT 0,
  net numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_payroll_lines TO authenticated;
GRANT ALL ON public.sparta_payroll_lines TO service_role;
ALTER TABLE public.sparta_payroll_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_pl_sel ON public.sparta_payroll_lines FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_pl_ins ON public.sparta_payroll_lines FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_pl_upd ON public.sparta_payroll_lines FOR UPDATE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_pl_del ON public.sparta_payroll_lines FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_employee_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.sparta_employees(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  issue_date date NOT NULL DEFAULT current_date,
  installments_count integer NOT NULL DEFAULT 1,
  monthly_deduction numeric(14,2) NOT NULL,
  amount_remaining numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','cancelled')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_employee_advances TO authenticated;
GRANT ALL ON public.sparta_employee_advances TO service_role;
ALTER TABLE public.sparta_employee_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY sparta_adv_sel ON public.sparta_employee_advances FOR SELECT TO authenticated USING (is_sparta_holding_member(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_adv_ins ON public.sparta_employee_advances FOR INSERT TO authenticated WITH CHECK (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_adv_upd ON public.sparta_employee_advances FOR UPDATE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());
CREATE POLICY sparta_adv_del ON public.sparta_employee_advances FOR DELETE TO authenticated USING (is_sparta_holding_admin(auth.uid()) AND company_id = sparta_holding_id());

DO $$ BEGIN CREATE TRIGGER trg_sparta_dept_uat BEFORE UPDATE ON public.sparta_departments FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sparta_emp_uat BEFORE UPDATE ON public.sparta_employees FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sparta_att_uat BEFORE UPDATE ON public.sparta_attendance FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sparta_lv_uat BEFORE UPDATE ON public.sparta_leaves FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sparta_pr_uat BEFORE UPDATE ON public.sparta_payroll_runs FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TRIGGER trg_sparta_adv_uat BEFORE UPDATE ON public.sparta_employee_advances FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
