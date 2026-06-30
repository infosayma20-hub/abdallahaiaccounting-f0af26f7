ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS customer_profile_url TEXT,
  ADD COLUMN IF NOT EXISTS customer_profile_platform TEXT;