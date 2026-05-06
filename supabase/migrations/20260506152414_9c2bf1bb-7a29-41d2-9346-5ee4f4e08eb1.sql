ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS batch_no text,
  ADD COLUMN IF NOT EXISTS production_date date;