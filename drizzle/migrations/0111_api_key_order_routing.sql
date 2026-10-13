ALTER TABLE public.external_api_keys ADD COLUMN IF NOT EXISTS order_routing text NOT NULL DEFAULT 'call_center';
ALTER TABLE public.external_api_keys DROP CONSTRAINT IF EXISTS external_api_keys_order_routing_chk;
ALTER TABLE public.external_api_keys ADD CONSTRAINT external_api_keys_order_routing_chk CHECK (order_routing IN ('call_center','pos_direct'));