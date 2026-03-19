
-- Add address to pos_customers for delivery purposes
ALTER TABLE public.pos_customers ADD COLUMN IF NOT EXISTS address text;

-- Add delivery_address to pos_orders for delivery orders
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_address text;
