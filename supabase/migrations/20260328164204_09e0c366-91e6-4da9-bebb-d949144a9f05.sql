
-- Add is_contra column to accounts table
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_contra boolean DEFAULT false;

-- Add nature column to accounts table (debit/credit)
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS nature text DEFAULT 'debit';
