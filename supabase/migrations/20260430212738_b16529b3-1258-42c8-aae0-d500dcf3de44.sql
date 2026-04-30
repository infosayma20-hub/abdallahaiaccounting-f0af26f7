-- ============================================================
-- S0: Configurable Payroll System Schema
-- ============================================================

-- 1) Payroll Policies
CREATE TABLE IF NOT EXISTS public.hr_payroll_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  salary_basis text NOT NULL DEFAULT 'monthly' CHECK (salary_basis IN ('monthly','daily','hourly')),
  month_days_mode text NOT NULL DEFAULT 'fixed_26' CHECK (month_days_mode IN ('fixed_30','fixed_28','fixed_26','calendar','custom')),
  month_days_custom numeric(5,2),
  daily_work_hours numeric(5,2) NOT NULL DEFAULT 8,
  overtime_multiplier numeric(5,2) NOT NULL DEFAULT 1.5,
  overtime_after_hours numeric(5,2) DEFAULT 8,
  absence_calculation text NOT NULL DEFAULT 'daily_rate' CHECK (absence_calculation IN ('daily_rate','hourly_rate','custom_formula','none')),
  absence_formula text,
  late_calculation text NOT NULL DEFAULT 'none' CHECK (late_calculation IN ('none','per_minute','per_hour','tiered','custom_formula')),
  late_grace_minutes integer DEFAULT 0,
  late_per_minute_rate numeric(8,4) DEFAULT 0,
  late_formula text,
  allowances_attendance_linked boolean NOT NULL DEFAULT false,
  deductions_mode text NOT NULL DEFAULT 'mixed' CHECK (deductions_mode IN ('auto','manual','mixed')),
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_policies_default_per_company
  ON public.hr_payroll_policies(company_id) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_payroll_policies_company ON public.hr_payroll_policies(company_id);

-- 2) Payroll Components
CREATE TABLE IF NOT EXISTS public.hr_payroll_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  policy_id uuid REFERENCES public.hr_payroll_policies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  kind text NOT NULL CHECK (kind IN ('allowance','deduction','earning','employer_contribution')),
  calculation_type text NOT NULL CHECK (calculation_type IN ('fixed_amount','percent_of_basic','percent_of_gross','per_day','per_hour','formula')),
  value numeric(15,4) NOT NULL DEFAULT 0,
  formula_expression text,
  is_taxable boolean NOT NULL DEFAULT false,
  is_attendance_linked boolean NOT NULL DEFAULT false,
  affects_eos boolean NOT NULL DEFAULT false,
  account_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, policy_id, code)
);
CREATE INDEX IF NOT EXISTS idx_payroll_components_company ON public.hr_payroll_components(company_id);
CREATE INDEX IF NOT EXISTS idx_payroll_components_policy ON public.hr_payroll_components(policy_id);

-- 3) Employee Payroll Profile
CREATE TABLE IF NOT EXISTS public.employee_payroll_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL UNIQUE,
  company_id uuid NOT NULL,
  policy_id uuid NOT NULL REFERENCES public.hr_payroll_policies(id) ON DELETE RESTRICT,
  basic_salary numeric(15,2) NOT NULL DEFAULT 0,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_payroll_profile_company ON public.employee_payroll_profile(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_payroll_profile_policy ON public.employee_payroll_profile(policy_id);

-- 4) Employee Component Values
CREATE TABLE IF NOT EXISTS public.employee_component_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  component_id uuid NOT NULL REFERENCES public.hr_payroll_components(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  value numeric(15,4) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_component_values_emp ON public.employee_component_values(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_component_values_company ON public.employee_component_values(company_id);

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_payroll()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_policies_updated ON public.hr_payroll_policies;
CREATE TRIGGER trg_payroll_policies_updated BEFORE UPDATE ON public.hr_payroll_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_payroll();
DROP TRIGGER IF EXISTS trg_payroll_components_updated ON public.hr_payroll_components;
CREATE TRIGGER trg_payroll_components_updated BEFORE UPDATE ON public.hr_payroll_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_payroll();
DROP TRIGGER IF EXISTS trg_employee_payroll_profile_updated ON public.employee_payroll_profile;
CREATE TRIGGER trg_employee_payroll_profile_updated BEFORE UPDATE ON public.employee_payroll_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_payroll();
DROP TRIGGER IF EXISTS trg_employee_component_values_updated ON public.employee_component_values;
CREATE TRIGGER trg_employee_component_values_updated BEFORE UPDATE ON public.employee_component_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_payroll();

-- ============================================================
-- Protection triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_delete_default_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_default = true THEN
    RAISE EXCEPTION 'لا يمكن حذف السياسة الافتراضية. عيّن سياسة افتراضية بديلة أولاً.';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_delete_default_policy ON public.hr_payroll_policies;
CREATE TRIGGER trg_prevent_delete_default_policy BEFORE DELETE ON public.hr_payroll_policies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_default_policy();

CREATE OR REPLACE FUNCTION public.prevent_delete_policy_with_employees()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.employee_payroll_profile WHERE policy_id = OLD.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'لا يمكن حذف هذه السياسة لأنها مرتبطة بـ % موظف.', v_count;
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_delete_policy_with_employees ON public.hr_payroll_policies;
CREATE TRIGGER trg_prevent_delete_policy_with_employees BEFORE DELETE ON public.hr_payroll_policies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_policy_with_employees();

-- ============================================================
-- RLS using is_team_member(auth.uid(), companies.owner_id)
-- ============================================================
ALTER TABLE public.hr_payroll_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_payroll_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_component_values ENABLE ROW LEVEL SECURITY;

-- Helper inline expression: company belongs to team
-- EXISTS (SELECT 1 FROM companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))

-- Policies table
DROP POLICY IF EXISTS "policies_select_team" ON public.hr_payroll_policies;
CREATE POLICY "policies_select_team" ON public.hr_payroll_policies
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id)));

DROP POLICY IF EXISTS "policies_insert_admin" ON public.hr_payroll_policies;
CREATE POLICY "policies_insert_admin" ON public.hr_payroll_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
  );

DROP POLICY IF EXISTS "policies_update_admin" ON public.hr_payroll_policies;
CREATE POLICY "policies_update_admin" ON public.hr_payroll_policies
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
  );

DROP POLICY IF EXISTS "policies_delete_admin" ON public.hr_payroll_policies;
CREATE POLICY "policies_delete_admin" ON public.hr_payroll_policies
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
  );

-- Components
DROP POLICY IF EXISTS "components_select_team" ON public.hr_payroll_components;
CREATE POLICY "components_select_team" ON public.hr_payroll_components
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id)));

DROP POLICY IF EXISTS "components_modify_admin" ON public.hr_payroll_components;
CREATE POLICY "components_modify_admin" ON public.hr_payroll_components
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role))
  );

-- Employee Profile
DROP POLICY IF EXISTS "emp_profile_select_team" ON public.employee_payroll_profile;
CREATE POLICY "emp_profile_select_team" ON public.employee_payroll_profile
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id)));

DROP POLICY IF EXISTS "emp_profile_modify_admin" ON public.employee_payroll_profile;
CREATE POLICY "emp_profile_modify_admin" ON public.employee_payroll_profile
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'accountant_senior'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'accountant_senior'::app_role))
  );

-- Employee Component Values
DROP POLICY IF EXISTS "emp_comp_values_select_team" ON public.employee_component_values;
CREATE POLICY "emp_comp_values_select_team" ON public.employee_component_values
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id)));

DROP POLICY IF EXISTS "emp_comp_values_modify_admin" ON public.employee_component_values;
CREATE POLICY "emp_comp_values_modify_admin" ON public.employee_component_values
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'accountant_senior'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND public.is_team_member(auth.uid(), c.owner_id))
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'hr_manager'::app_role) OR public.has_role(auth.uid(), 'accountant_senior'::app_role))
  );

-- ============================================================
-- BACKFILL: default policy per company
-- ============================================================
DO $$
DECLARE
  v_malaki_company_id uuid := 'b4a221be-7b96-4952-8eb8-6ca749b46ca4';
  c RECORD;
  v_is_malaki boolean;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    IF EXISTS (SELECT 1 FROM public.hr_payroll_policies WHERE company_id = c.id AND is_default = true) THEN
      CONTINUE;
    END IF;
    v_is_malaki := (c.id = v_malaki_company_id);
    INSERT INTO public.hr_payroll_policies (
      company_id, name, description,
      salary_basis, month_days_mode, daily_work_hours,
      overtime_multiplier, overtime_after_hours,
      absence_calculation, late_calculation, late_grace_minutes,
      allowances_attendance_linked, deductions_mode,
      is_active, is_default
    ) VALUES (
      c.id, 'السياسة الحالية',
      CASE WHEN v_is_malaki THEN 'سياسة الرواتب الافتراضية (Malaki Template - 28 يوم)'
           ELSE 'سياسة الرواتب الافتراضية (Standard - 26 يوم)' END,
      'monthly',
      CASE WHEN v_is_malaki THEN 'fixed_28' ELSE 'fixed_26' END,
      CASE WHEN v_is_malaki THEN 10 ELSE 8 END,
      1.5,
      CASE WHEN v_is_malaki THEN 10 ELSE 8 END,
      'daily_rate', 'none', 0, false, 'mixed', true, true
    );
  END LOOP;
END $$;

-- ============================================================
-- BACKFILL: link every employee to their company's default policy
-- ============================================================
INSERT INTO public.employee_payroll_profile (employee_id, company_id, policy_id, basic_salary)
SELECT e.id, e.company_id, p.id, COALESCE(e.base_salary, 0)
FROM public.employees e
JOIN public.hr_payroll_policies p ON p.company_id = e.company_id AND p.is_default = true
WHERE e.company_id IS NOT NULL
ON CONFLICT (employee_id) DO NOTHING;

COMMENT ON TABLE public.hr_payroll_policies IS 'Per-company payroll calculation policies (S0)';
COMMENT ON TABLE public.hr_payroll_components IS 'Per-company allowances/deductions/earnings (S0)';
COMMENT ON TABLE public.employee_payroll_profile IS 'Links each employee to a payroll policy with basic salary (S0)';
COMMENT ON TABLE public.employee_component_values IS 'Per-employee overrides for specific payroll components (S0)';