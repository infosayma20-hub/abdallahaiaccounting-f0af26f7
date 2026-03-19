
-- Add foreign_amount and exchange_rate columns to transactions table
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.transactions.foreign_amount IS 'Actual amount in foreign currency (e.g. 100 USD). amount column always holds ILS equivalent.';
COMMENT ON COLUMN public.transactions.exchange_rate IS 'Exchange rate used: 1 foreign unit = X ILS';
