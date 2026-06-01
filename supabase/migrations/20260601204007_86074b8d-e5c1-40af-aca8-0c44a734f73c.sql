
-- Idempotency: unique constraint on delivery_zones
ALTER TABLE public.delivery_zones
  ADD CONSTRAINT delivery_zones_user_city_area_branch_key
  UNIQUE (user_id, city, area_name, branch_id);

-- Add structured delivery info + fee to call_center_orders
ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_info jsonb;

-- Index for fast zone lookups by city
CREATE INDEX IF NOT EXISTS idx_delivery_zones_user_city_active
  ON public.delivery_zones (user_id, city, is_active);
