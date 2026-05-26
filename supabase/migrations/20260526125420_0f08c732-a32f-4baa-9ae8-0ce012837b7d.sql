ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_to_device text;

CREATE INDEX IF NOT EXISTS idx_call_center_orders_delivered_at
  ON public.call_center_orders(delivered_at)
  WHERE delivered_at IS NULL;