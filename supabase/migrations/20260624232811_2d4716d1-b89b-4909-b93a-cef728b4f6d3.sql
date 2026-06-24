-- 1) Add skip_wheels_dispatch directly on pos_orders so the auto-dispatch
-- trigger does NOT depend on a cross-table lookup (which had a race condition
-- with the cco→pos_orders link timing, causing Wheels-sourced orders to be
-- re-dispatched and duplicated on Wheels).
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS skip_wheels_dispatch boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pos_orders.skip_wheels_dispatch IS
  'When true, post-payment Wheels auto-dispatch is skipped. Mirrored from call_center_orders.skip_wheels_dispatch when the order is linked, and copied on insert by the cashier flow.';

-- 2) Backfill from call_center_orders for any already-linked orders.
UPDATE public.pos_orders po
   SET skip_wheels_dispatch = true
  FROM public.call_center_orders cco
 WHERE cco.pos_order_id = po.id
   AND cco.skip_wheels_dispatch = true
   AND po.skip_wheels_dispatch = false;

-- 3) Auto-sync trigger on call_center_orders: whenever the skip flag or the
-- link changes, mirror onto pos_orders. Closes the original race window.
CREATE OR REPLACE FUNCTION public.sync_cco_skip_to_pos_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pos_order_id IS NOT NULL
     AND COALESCE(NEW.skip_wheels_dispatch, false) = true
  THEN
    UPDATE public.pos_orders
       SET skip_wheels_dispatch = true
     WHERE id = NEW.pos_order_id
       AND skip_wheels_dispatch = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cco_skip_to_pos_order ON public.call_center_orders;
CREATE TRIGGER trg_sync_cco_skip_to_pos_order
AFTER INSERT OR UPDATE OF skip_wheels_dispatch, pos_order_id
  ON public.call_center_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_cco_skip_to_pos_order();

-- 4) Harden the enqueue trigger to check pos_orders.skip_wheels_dispatch
-- directly AND fall back to a cco lookup. If either says skip, mark
-- wheels_request_status='skipped' and bail without HTTP call.
CREATE OR REPLACE FUNCTION public.enqueue_paid_delivery_to_wheels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key text;
  v_skip boolean := COALESCE(NEW.skip_wheels_dispatch, false);
BEGIN
  IF COALESCE(NEW.is_delivery, false) <> true
     OR NEW.state <> 'paid'
     OR COALESCE(NEW.wheels_request_status, 'not_sent') <> 'not_sent'
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.state = NEW.state
     AND COALESCE(OLD.wheels_request_status, 'not_sent') = COALESCE(NEW.wheels_request_status, 'not_sent')
  THEN
    RETURN NEW;
  END IF;

  -- Fallback lookup: in case the cco→pos_orders link landed *after* the
  -- pos_orders row was inserted, double-check the linked cco row here too.
  IF NOT v_skip THEN
    SELECT COALESCE(skip_wheels_dispatch, false)
      INTO v_skip
      FROM public.call_center_orders
     WHERE pos_order_id = NEW.id
     LIMIT 1;
    v_skip := COALESCE(v_skip, false);
  END IF;

  IF v_skip THEN
    UPDATE public.pos_orders
       SET wheels_request_status = 'skipped',
           skip_wheels_dispatch = true,
           wheels_last_error = NULL,
           updated_at = now()
     WHERE id = NEW.id
       AND COALESCE(wheels_request_status, 'not_sent') = 'not_sent';
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF v_key IS NULL OR length(v_key) < 20 THEN
    UPDATE public.pos_orders
       SET wheels_request_status = 'failed',
           wheels_last_error = 'مفتاح الإرسال الخلفي غير متوفر',
           updated_at = now()
     WHERE id = NEW.id
       AND COALESCE(wheels_request_status, 'not_sent') = 'not_sent';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://omwuyscprzexgmxgittp.supabase.co/functions/v1/send-to-wheels',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('order_id', NEW.id)
  );

  RETURN NEW;
END;
$$;