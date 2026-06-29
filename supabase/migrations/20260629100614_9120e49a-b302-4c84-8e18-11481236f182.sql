ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS invoice_show_balance_box boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voucher_show_balance_box boolean NOT NULL DEFAULT false;