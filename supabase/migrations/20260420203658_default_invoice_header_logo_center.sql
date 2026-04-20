-- Generalize "logo_center" header as the default invoice layout for all users.
-- Only updates users who are still on the previous default ("logo_right") or have no value set.
-- Users who explicitly chose "logo_left" or "no_logo" are preserved.

UPDATE public.company_settings
SET invoice_header_layout = 'logo_center'
WHERE invoice_header_layout IS NULL
   OR invoice_header_layout = ''
   OR invoice_header_layout = 'logo_right';

-- Set default for new rows going forward
ALTER TABLE public.company_settings
  ALTER COLUMN invoice_header_layout SET DEFAULT 'logo_center';
