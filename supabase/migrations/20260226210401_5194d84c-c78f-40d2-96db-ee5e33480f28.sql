
-- Add secret_key and qr_rotation_minutes to branches
ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS secret_key text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
ADD COLUMN IF NOT EXISTS qr_rotation_minutes integer NOT NULL DEFAULT 240;

-- Create index on secret_key for lookups
CREATE INDEX IF NOT EXISTS idx_branches_secret_key ON public.branches(secret_key);
