ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS invoice_header_layout text DEFAULT 'logo_right',
  ADD COLUMN IF NOT EXISTS invoice_primary_color text DEFAULT '#1B3A5C',
  ADD COLUMN IF NOT EXISTS invoice_show_signature boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_tax_summary boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_show_amount_words boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_footer_message text DEFAULT 'شكراً لتعاملكم معنا';