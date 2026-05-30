-- Cashier policy: configurable windows + replacement invoice tracking

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_cashier_cancel_window_minutes INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS pos_cashier_invoice_amount_visible_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS is_replacement BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces_order_id UUID NULL,
  ADD COLUMN IF NOT EXISTS replaces_order_number TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_orders_replaces_order_id
  ON public.pos_orders(replaces_order_id) WHERE replaces_order_id IS NOT NULL;