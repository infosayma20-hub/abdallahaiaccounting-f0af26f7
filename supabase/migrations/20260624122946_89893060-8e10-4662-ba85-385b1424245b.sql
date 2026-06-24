CREATE OR REPLACE FUNCTION public.enqueue_paid_delivery_to_wheels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_key text;
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

DROP TRIGGER IF EXISTS trg_enqueue_paid_delivery_to_wheels ON public.pos_orders;
CREATE TRIGGER trg_enqueue_paid_delivery_to_wheels
AFTER INSERT OR UPDATE ON public.pos_orders
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_paid_delivery_to_wheels();