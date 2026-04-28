-- 1) Add category column with CHECK constraint (NULL allowed for legacy rows)
ALTER TABLE public.employee_financial_movements
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- Drop existing constraint if present (idempotent)
ALTER TABLE public.employee_financial_movements
  DROP CONSTRAINT IF EXISTS efm_category_check;

ALTER TABLE public.employee_financial_movements
  ADD CONSTRAINT efm_category_check
  CHECK (
    category IS NULL OR category IN (
      'food',
      'transport',
      'loan_installment',
      'advance',
      'penalty',
      'purchase',
      'cash_shortage',
      'cash_surplus',
      'adjustment',
      'previous_balance',
      'other'
    )
  );

-- 2) Index for Payroll Preview lookups
CREATE INDEX IF NOT EXISTS idx_efm_emp_date_category
  ON public.employee_financial_movements (employee_id, movement_date, category);

-- 3) Lock guard: prevent edits inside locked days
-- Reuses the same is_attendance_day_locked helper installed in B2.2.1.
-- POS / system-generated rows are exempt to avoid breaking production webhooks.
CREATE OR REPLACE FUNCTION public.guard_employee_fin_movements_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row RECORD;
  _emp RECORD;
  _date DATE;
  _src TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _row := OLD;
  ELSE
    _row := NEW;
  END IF;

  _date := _row.movement_date;
  _src := COALESCE(LOWER(_row.source_type), '');

  -- Exempt automated / system writers (POS, system, webhooks, payroll)
  IF _src LIKE 'pos%' OR _src = 'system' OR _src LIKE 'payroll%' OR _src LIKE 'webhook%' THEN
    RETURN _row;
  END IF;

  -- Look up the employee's auth_user_id (tenant owner)
  SELECT auth_user_id, branch_id INTO _emp
  FROM public.employees
  WHERE id = _row.employee_id;

  IF _emp.auth_user_id IS NULL OR _date IS NULL THEN
    RETURN _row;
  END IF;

  IF public.is_attendance_day_locked(_emp.auth_user_id, _date, _emp.branch_id) THEN
    RAISE EXCEPTION 'اليوم % مغلق من قبل الإدارة. لا يمكن إضافة أو تعديل الحركات المالية في هذا اليوم. الرجاء فتح اليوم أولاً.',
      to_char(_date, 'YYYY-MM-DD')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN _row;
END;
$$;

DROP TRIGGER IF EXISTS trg_efm_lock_guard ON public.employee_financial_movements;
CREATE TRIGGER trg_efm_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.employee_financial_movements
FOR EACH ROW EXECUTE FUNCTION public.guard_employee_fin_movements_lock();

COMMENT ON COLUMN public.employee_financial_movements.category IS
  'B3.1: Classification of the movement. NULL = legacy / unclassified (shown as "other" in UI). Allowed: food, transport, loan_installment, advance, penalty, purchase, cash_shortage, cash_surplus, adjustment, previous_balance, other.';
COMMENT ON COLUMN public.employee_financial_movements.reference_number IS
  'B3.1: Human-visible reference (PV/RV/POS-### / etc.) for reconciliation.';