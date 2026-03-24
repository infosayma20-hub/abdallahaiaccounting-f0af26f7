ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS custom_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_currency text DEFAULT 'ILS',
  ADD COLUMN IF NOT EXISTS agreement_type text DEFAULT 'monthly';