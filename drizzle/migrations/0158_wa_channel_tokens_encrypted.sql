CREATE TABLE public.wa_channel_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL UNIQUE REFERENCES public.wa_channels(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.wa_channel_tokens TO service_role;
ALTER TABLE public.wa_channel_tokens ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.wa_channel_tokens IS 'AES-GCM encrypted WhatsApp channel tokens; key lives only in edge secret WA_TOKEN_KEY; service_role only (no policies).';
COMMENT ON COLUMN public.wa_channels.token_secret_id IS 'References wa_channel_tokens.id (encrypted token), never the token itself.';