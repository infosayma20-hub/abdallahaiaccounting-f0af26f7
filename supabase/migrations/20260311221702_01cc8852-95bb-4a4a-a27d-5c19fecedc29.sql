ALTER TABLE public.company_settings 
  ADD COLUMN IF NOT EXISTS pos_disable_cogs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_disable_stock_deduction boolean NOT NULL DEFAULT false;