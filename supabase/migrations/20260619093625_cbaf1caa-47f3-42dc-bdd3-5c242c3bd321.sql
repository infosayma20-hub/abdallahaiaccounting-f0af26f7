
-- Phase 1.1: Structured fields for POS meal deductions + tenant flag + edit guard

-- 1) Add structured columns to employee_financial_movements
ALTER TABLE public.employee_financial_movements
  ADD COLUMN IF NOT EXISTS meal_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS original_full_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS meal_discount_pct SMALLINT;

DO $$ BEGIN
  ALTER TABLE public.employee_financial_movements
    ADD CONSTRAINT efm_meal_discount_type_check
    CHECK (meal_discount_type IS NULL OR meal_discount_type IN ('family','individual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.employee_financial_movements
    ADD CONSTRAINT efm_meal_discount_pct_check
    CHECK (meal_discount_pct IS NULL OR (meal_discount_pct BETWEEN 0 AND 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_efm_meal_monthly
  ON public.employee_financial_movements(employee_id, salary_year, salary_month, meal_discount_type)
  WHERE source_type = 'pos_meal';

-- 2) Tenant flag on payroll_settings
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS meal_discount_mode TEXT NOT NULL DEFAULT 'single';

DO $$ BEGIN
  ALTER TABLE public.payroll_settings
    ADD CONSTRAINT payroll_settings_meal_discount_mode_check
    CHECK (meal_discount_mode IN ('single','dual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Guard trigger: only admin / hr_manager / super_admin can UPDATE or DELETE pos_meal rows
CREATE OR REPLACE FUNCTION public.guard_pos_meal_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_allowed BOOLEAN := false;
BEGIN
  -- Service role / no JWT context: allow (background jobs, DB tools)
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only guard pos_meal rows; pass-through anything else
  IF (TG_OP = 'UPDATE' AND OLD.source_type <> 'pos_meal') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'DELETE' AND OLD.source_type <> 'pos_meal') THEN
    RETURN OLD;
  END IF;

  -- Tenant owner is implicitly allowed (they are admin of their own data)
  IF v_caller = COALESCE(OLD.user_id, NEW.user_id) THEN
    v_allowed := true;
  END IF;

  -- Roles allowed to mutate
  IF NOT v_allowed AND (
       public.has_role(v_caller, 'admin'::app_role)
    OR public.has_role(v_caller, 'super_admin'::app_role)
    OR public.has_role(v_caller, 'hr_manager'::app_role)
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكن تعديل أو حذف حركات وجبات POS إلا من قبل المدير أو مدير الموارد البشرية'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pos_meal_edit ON public.employee_financial_movements;
CREATE TRIGGER trg_guard_pos_meal_edit
  BEFORE UPDATE OR DELETE ON public.employee_financial_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_pos_meal_edit();
