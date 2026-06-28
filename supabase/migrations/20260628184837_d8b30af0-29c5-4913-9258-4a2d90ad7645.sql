ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS invoice_logo_size TEXT NOT NULL DEFAULT 'medium';