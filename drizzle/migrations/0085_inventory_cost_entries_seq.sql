ALTER TABLE public.inventory_cost_entries ADD COLUMN IF NOT EXISTS seq bigserial;
CREATE INDEX IF NOT EXISTS idx_ice_product_seq ON public.inventory_cost_entries(product_id, warehouse_id, seq);
