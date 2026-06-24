CREATE OR REPLACE FUNCTION public.mark_paid_delivery_for_wheels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.state = 'paid'
     AND COALESCE(NEW.is_delivery, false) = true
     AND COALESCE(NEW.wheels_request_status, 'not_sent') = 'not_sent'
     AND (OLD.state IS DISTINCT FROM NEW.state OR OLD.wheels_request_status IS DISTINCT FROM NEW.wheels_request_status)
  THEN
    -- Marker for operational visibility: frontend/edge function may send it
    -- immediately; if not, reports can still identify it as pending dispatch.
    NEW.wheels_request_status := 'not_sent';
    NEW.delivery_status := COALESCE(NULLIF(NEW.delivery_status, ''), 'pending_dispatch');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_paid_delivery_for_wheels ON public.pos_orders;
CREATE TRIGGER trg_mark_paid_delivery_for_wheels
BEFORE UPDATE ON public.pos_orders
FOR EACH ROW
EXECUTE FUNCTION public.mark_paid_delivery_for_wheels();