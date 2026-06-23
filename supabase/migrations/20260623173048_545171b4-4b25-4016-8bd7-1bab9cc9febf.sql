ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS visa_gl_account_code TEXT;

COMMENT ON COLUMN public.call_center_orders.visa_gl_account_code IS
  'GL account code for the specific visa variant chosen by the call-center agent (e.g. Yummy/FoodOnTime/Wheels visa GL). NULL = generic visa or cash.';