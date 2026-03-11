
-- Add new permission columns to pos_user_permissions
ALTER TABLE public.pos_user_permissions
  ADD COLUMN IF NOT EXISTS allow_credit_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_cash_drawer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_invoices boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resend_invoice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_products boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delete_products boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_inventory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS add_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_customers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edit_customers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS view_sales_report boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS export_reports boolean NOT NULL DEFAULT false;
