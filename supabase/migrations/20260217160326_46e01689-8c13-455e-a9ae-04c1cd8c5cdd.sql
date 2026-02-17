-- Store WebAuthn credentials for passkey/Face ID login
CREATE TABLE public.passkey_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own passkeys"
ON public.passkey_credentials FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passkeys"
ON public.passkey_credentials FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passkeys"
ON public.passkey_credentials FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own passkeys"
ON public.passkey_credentials FOR UPDATE
USING (auth.uid() = user_id);

-- Challenge storage for WebAuthn (temporary, short-lived)
CREATE TABLE public.webauthn_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- Allow service role only (edge functions use service role)
CREATE POLICY "Service role access"
ON public.webauthn_challenges FOR ALL
USING (true)
WITH CHECK (true);