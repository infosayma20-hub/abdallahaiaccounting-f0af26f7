ALTER TABLE public.employee_financial_movements
  DROP CONSTRAINT IF EXISTS efm_meal_discount_type_check;
ALTER TABLE public.employee_financial_movements
  ADD CONSTRAINT efm_meal_discount_type_check
  CHECK (meal_discount_type IS NULL OR meal_discount_type IN ('family','individual','none'));