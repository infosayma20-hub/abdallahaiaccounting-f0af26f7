-- Add reversed_by_id column to link original transaction to its reverse entry
ALTER TABLE public.transactions 
ADD COLUMN reversed_by_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Add index for fast lookups
CREATE INDEX idx_transactions_reversed_by_id ON public.transactions(reversed_by_id) WHERE reversed_by_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.transactions.reversed_by_id IS 'References the reverse entry transaction that cancelled this one. NULL means not reversed.';