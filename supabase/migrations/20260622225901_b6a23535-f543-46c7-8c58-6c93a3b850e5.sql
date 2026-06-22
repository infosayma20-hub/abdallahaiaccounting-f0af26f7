ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_currency_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_currency_check
  CHECK (currency = ANY (ARRAY['شيكل'::text, 'دينار'::text, 'دولار'::text, 'يورو'::text, 'جنيه'::text]));