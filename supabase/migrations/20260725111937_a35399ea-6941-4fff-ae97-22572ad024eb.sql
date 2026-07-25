ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS default_invoice_kind TEXT NOT NULL DEFAULT 'credit'
  CHECK (default_invoice_kind IN ('credit','cash'));

UPDATE public.company_settings cs
SET default_invoice_kind = 'cash'
WHERE cs.user_id = (SELECT id FROM auth.users WHERE email = 'nihadghazal153@gmail.com' LIMIT 1);