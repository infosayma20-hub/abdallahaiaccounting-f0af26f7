
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS total_includes_delivery_fee boolean NOT NULL DEFAULT false;

-- Backfill: existing rows that have a delivery_fee had it baked into total.
UPDATE public.pos_orders
SET total_includes_delivery_fee = true
WHERE COALESCE(delivery_fee, 0) > 0
  AND total_includes_delivery_fee = false;

COMMENT ON COLUMN public.pos_orders.total_includes_delivery_fee IS
'true = legacy row whose `total` already includes `delivery_fee`. false = new row where `total` is items only and `delivery_fee` is informational (paid by customer directly to the driver, never enters the restaurant cash drawer).';
