
-- Add delivery fields to pos_orders
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS is_delivery BOOLEAN DEFAULT false;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS zone_code TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS area_name TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'none';
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS assigned_captain_name TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS assigned_captain_phone TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS assigned_captain_vehicle TEXT;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_requested_at TIMESTAMPTZ;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS delivery_accepted_at TIMESTAMPTZ;

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_delivery_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.delivery_status IS NOT NULL AND NEW.delivery_status NOT IN ('none','pending','dispatching','accepted','in_transit','delivered','failed') THEN
    RAISE EXCEPTION 'Invalid delivery_status: %', NEW.delivery_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_delivery_status ON public.pos_orders;
CREATE TRIGGER trg_validate_delivery_status
  BEFORE INSERT OR UPDATE ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_delivery_status();
