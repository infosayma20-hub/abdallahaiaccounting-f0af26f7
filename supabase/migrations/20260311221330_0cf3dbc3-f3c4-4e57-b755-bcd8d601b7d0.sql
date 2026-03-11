ALTER TABLE public.pos_user_permissions 
  ADD COLUMN IF NOT EXISTS manage_products_categories boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_invoice_log boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_cancel_invoices boolean NOT NULL DEFAULT false;