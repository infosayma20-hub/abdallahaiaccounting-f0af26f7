-- Add IP & User-Agent tracking columns to pos_orders + pos_payments
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS client_ip inet,
  ADD COLUMN IF NOT EXISTS client_user_agent text,
  ADD COLUMN IF NOT EXISTS client_forwarded_for text;

ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS client_ip inet,
  ADD COLUMN IF NOT EXISTS client_user_agent text;

CREATE INDEX IF NOT EXISTS idx_pos_orders_client_ip ON public.pos_orders(client_ip);
CREATE INDEX IF NOT EXISTS idx_pos_payments_client_ip ON public.pos_payments(client_ip);

-- Helper to extract client info from PostgREST request headers
CREATE OR REPLACE FUNCTION public._capture_client_request_info()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h jsonb;
  xff text;
  real_ip text;
  ua text;
  ip_text text;
  ip_val inet;
BEGIN
  BEGIN
    h := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    h := NULL;
  END;

  IF h IS NULL THEN
    RETURN jsonb_build_object('ip', NULL, 'ua', NULL, 'xff', NULL);
  END IF;

  xff := h->>'x-forwarded-for';
  real_ip := h->>'x-real-ip';
  ua := h->>'user-agent';

  -- first IP in x-forwarded-for is the original client
  IF xff IS NOT NULL AND length(xff) > 0 THEN
    ip_text := trim(split_part(xff, ',', 1));
  ELSIF real_ip IS NOT NULL AND length(real_ip) > 0 THEN
    ip_text := trim(real_ip);
  ELSE
    ip_text := NULL;
  END IF;

  BEGIN
    IF ip_text IS NOT NULL THEN
      ip_val := ip_text::inet;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    ip_val := NULL;
  END;

  RETURN jsonb_build_object(
    'ip', ip_val,
    'ua', ua,
    'xff', xff
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._capture_client_request_info() TO authenticated, anon, service_role;

-- Trigger: stamp pos_orders on INSERT
CREATE OR REPLACE FUNCTION public.tg_pos_orders_stamp_client_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE info jsonb;
BEGIN
  info := public._capture_client_request_info();
  IF NEW.client_ip IS NULL THEN
    NEW.client_ip := NULLIF(info->>'ip','')::inet;
  END IF;
  IF NEW.client_user_agent IS NULL THEN
    NEW.client_user_agent := info->>'ua';
  END IF;
  IF NEW.client_forwarded_for IS NULL THEN
    NEW.client_forwarded_for := info->>'xff';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_client_info ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_client_info
BEFORE INSERT ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_pos_orders_stamp_client_info();

-- Trigger: stamp pos_payments on INSERT
CREATE OR REPLACE FUNCTION public.tg_pos_payments_stamp_client_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE info jsonb;
BEGIN
  info := public._capture_client_request_info();
  IF NEW.client_ip IS NULL THEN
    NEW.client_ip := NULLIF(info->>'ip','')::inet;
  END IF;
  IF NEW.client_user_agent IS NULL THEN
    NEW.client_user_agent := info->>'ua';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_payments_client_info ON public.pos_payments;
CREATE TRIGGER trg_pos_payments_client_info
BEFORE INSERT ON public.pos_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_pos_payments_stamp_client_info();
