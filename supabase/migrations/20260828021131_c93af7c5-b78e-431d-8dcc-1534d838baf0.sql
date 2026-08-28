
-- 1) test/live environment on API keys
ALTER TABLE public.external_api_keys
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'live';

DO $$ BEGIN
  ALTER TABLE public.external_api_keys
    ADD CONSTRAINT external_api_keys_environment_chk CHECK (environment IN ('live','test'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) outbound webhook endpoints
CREATE TABLE IF NOT EXISTS public.external_webhook_endpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT 'تطبيق الجوال',
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'live',
  events TEXT[] NOT NULL DEFAULT ARRAY['order.accepted','order.completed','order.cancelled','order.status_changed'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_webhook_endpoints_env_chk CHECK (environment IN ('live','test'))
);

CREATE INDEX IF NOT EXISTS idx_external_webhook_endpoints_user
  ON public.external_webhook_endpoints(user_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_webhook_endpoints TO authenticated;
GRANT ALL ON public.external_webhook_endpoints TO service_role;

ALTER TABLE public.external_webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their own webhook endpoints" ON public.external_webhook_endpoints;
CREATE POLICY "Owners manage their own webhook endpoints"
  ON public.external_webhook_endpoints
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_external_webhook_endpoints_updated_at ON public.external_webhook_endpoints;
CREATE TRIGGER trg_external_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.external_webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.external_api_keys_touch_updated_at();

-- 3) dispatcher: send order status changes to registered endpoints
CREATE OR REPLACE FUNCTION public.dispatch_external_order_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  ep RECORD;
  evt TEXT;
  body JSONB;
  sig TEXT;
BEGIN
  -- only orders that came from an external app
  IF NEW.client_reference_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  evt := CASE NEW.status
    WHEN 'accepted' THEN 'order.accepted'
    WHEN 'completed' THEN 'order.completed'
    WHEN 'cancelled' THEN 'order.cancelled'
    ELSE 'order.status_changed'
  END;

  body := jsonb_build_object(
    'event', evt,
    'sent_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'data', jsonb_build_object(
      'unify_order_id', NEW.id,
      'reference', NEW.client_reference_id,
      'status', NEW.status,
      'total', NEW.total,
      'branch_name', NEW.target_branch_name,
      'payment_method', NEW.payment_method,
      'delivery_type', NEW.delivery_type,
      'pos_order_id', NEW.pos_order_id,
      'accepted_at', NEW.accepted_at,
      'cancelled_at', NEW.cancelled_at,
      'cancel_reason', NEW.cancel_reason
    )
  );

  FOR ep IN
    SELECT * FROM public.external_webhook_endpoints
    WHERE user_id = NEW.user_id AND is_active AND environment = 'live'
      AND (evt = ANY(events))
  LOOP
    sig := encode(extensions.hmac(body::text, ep.secret, 'sha256'), 'hex');
    BEGIN
      PERFORM net.http_post(
        url := ep.url,
        body := body,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Unify-Event', evt,
          'X-Unify-Signature', sig
        ),
        timeout_milliseconds := 5000
      );
      UPDATE public.external_webhook_endpoints SET last_delivery_at = now() WHERE id = ep.id;
      INSERT INTO public.webhook_logs (user_id, direction, event_type, endpoint, payload, success, order_id, order_reference)
      VALUES (NEW.user_id, 'out', evt, ep.url, body, true, NEW.id, NEW.client_reference_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.webhook_logs (user_id, direction, event_type, endpoint, payload, success, order_id, order_reference, error_message)
      VALUES (NEW.user_id, 'out', evt, ep.url, body, false, NEW.id, NEW.client_reference_id, SQLERRM);
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_external_order_webhook ON public.call_center_orders;
CREATE TRIGGER trg_dispatch_external_order_webhook
  AFTER INSERT OR UPDATE OF status ON public.call_center_orders
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_external_order_webhook();
