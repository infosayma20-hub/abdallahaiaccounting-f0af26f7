UPDATE public.company_settings
SET invoice_header_layout = 'logo_middle'
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'k.malhis@outlook.com'
);