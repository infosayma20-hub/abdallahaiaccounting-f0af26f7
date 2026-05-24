
ALTER TABLE public.passkey_credentials
  ADD COLUMN IF NOT EXISTS public_key_algorithm integer NOT NULL DEFAULT -7; -- -7 = ES256
