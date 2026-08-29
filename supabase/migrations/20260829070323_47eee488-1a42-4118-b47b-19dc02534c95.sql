ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS allow_manual_code boolean NOT NULL DEFAULT true;

UPDATE public.branches
SET allow_manual_code = false
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73';