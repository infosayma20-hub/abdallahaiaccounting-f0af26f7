ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_type TEXT DEFAULT 'debit',
  ADD COLUMN IF NOT EXISTS opening_balance_date DATE;