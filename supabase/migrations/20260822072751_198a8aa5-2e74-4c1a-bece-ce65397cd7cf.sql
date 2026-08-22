ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS manual_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_manual_ref_uniq ON public.orders (user_id, manual_ref) WHERE manual_ref IS NOT NULL AND manual_ref <> '';

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.contacts(id);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS procurement_order_id uuid REFERENCES public.procurement_orders(id);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id);
CREATE INDEX IF NOT EXISTS transactions_order_id_idx ON public.transactions (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id);
CREATE INDEX IF NOT EXISTS invoices_order_id_idx ON public.invoices (order_id) WHERE order_id IS NOT NULL;

ALTER TABLE public.procurement_orders ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.orders(id);