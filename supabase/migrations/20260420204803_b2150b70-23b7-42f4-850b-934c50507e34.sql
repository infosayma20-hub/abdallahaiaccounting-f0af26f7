UPDATE public.company_settings
SET invoice_header_layout = 'logo_center'
WHERE invoice_header_layout = 'logo_right'
   OR invoice_header_layout IS NULL
   OR invoice_header_layout = '';