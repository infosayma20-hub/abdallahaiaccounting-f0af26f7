-- Add delivery_fee tracking to pos_orders so restaurant sales reports can
-- cleanly separate items revenue from delivery fees collected on behalf of
-- the delivery company. delivery_fee here mirrors the value originating on
-- call_center_orders.delivery_fee for the same order; legacy/non-delivery
-- orders stay at 0.
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pos_orders.delivery_fee IS
  'Delivery fee included in total but NOT considered restaurant sales. Subtract from total to get net items revenue.';

CREATE INDEX IF NOT EXISTS idx_pos_orders_delivery_fee
  ON public.pos_orders (user_id)
  WHERE delivery_fee > 0;