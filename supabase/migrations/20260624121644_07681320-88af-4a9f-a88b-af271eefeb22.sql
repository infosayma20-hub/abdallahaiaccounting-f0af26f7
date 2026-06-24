ALTER TABLE public.call_center_orders DROP CONSTRAINT IF EXISTS call_center_orders_status_check;
ALTER TABLE public.call_center_orders ADD CONSTRAINT call_center_orders_status_check
  CHECK (status = ANY (ARRAY['pending','accepted','completed','cancelled','cancelled_after_acceptance']));