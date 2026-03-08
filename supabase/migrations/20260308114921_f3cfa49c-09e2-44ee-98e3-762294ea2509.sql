ALTER TABLE public.import_shipment_items
ADD COLUMN IF NOT EXISTS ctn_qty integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS ctns integer DEFAULT 0;