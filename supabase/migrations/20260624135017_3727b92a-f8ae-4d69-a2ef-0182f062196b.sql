ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS skip_wheels_dispatch boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.call_center_orders.skip_wheels_dispatch IS
  'When true, the post-payment Wheels auto-dispatch is skipped — used when the order originally came from Wheels app and already exists on Wheels'' courier screen.';