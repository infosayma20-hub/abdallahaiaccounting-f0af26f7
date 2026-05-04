-- Fix critical schema drift: stock_movements is missing columns referenced by:
--   * create_rep_sale_atomic (rep portal sale)
--   * cascade_invoice_cancel_to_transactions (cancel/void)
--   * multiple frontend pages (InvoiceCreatePage, ReturnCreatePage, ...)
-- All adds are nullable + IF NOT EXISTS — fully backwards compatible.

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id   uuid,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS unit_cost      numeric;

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference
  ON public.stock_movements (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_user_product
  ON public.stock_movements (user_id, product_id);