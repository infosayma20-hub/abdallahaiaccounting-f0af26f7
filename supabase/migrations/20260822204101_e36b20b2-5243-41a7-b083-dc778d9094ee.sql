-- 1) API keys for external applications (per-company)
CREATE TABLE public.external_api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL, -- tenant owner (dataOwnerId convention)
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, -- sha256 hex of the raw key; raw key never stored
  key_prefix TEXT NOT NULL,      -- first 8 chars of raw key, for display
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_external_api_keys_user ON public.external_api_keys(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_api_keys TO authenticated;
GRANT ALL ON public.external_api_keys TO service_role;

ALTER TABLE public.external_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own api keys"
  ON public.external_api_keys
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.external_api_keys_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_external_api_keys_updated_at
  BEFORE UPDATE ON public.external_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.external_api_keys_touch_updated_at();

-- 2) Idempotency reference for externally-submitted orders
ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS client_reference_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_call_center_orders_client_ref
  ON public.call_center_orders(user_id, client_reference_id)
  WHERE client_reference_id IS NOT NULL;