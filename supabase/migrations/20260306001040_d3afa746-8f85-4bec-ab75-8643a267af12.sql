
-- Fix: Re-create the trigger function to set table to 'available' (not 'cleaning') after payment
CREATE OR REPLACE FUNCTION public.update_table_status_on_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When a new order with table_id is created
  IF TG_OP = 'INSERT' AND NEW.table_id IS NOT NULL THEN
    UPDATE public.restaurant_tables SET
      status           = 'occupied',
      current_order_id = NEW.id,
      occupied_at      = NOW(),
      current_guests   = COALESCE(NEW.guest_count, 1),
      updated_at       = NOW()
    WHERE id = NEW.table_id;
  END IF;

  -- When order is completed/paid → release table
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT NULL AND NEW.state = 'paid' AND OLD.state != 'paid' THEN
    UPDATE public.restaurant_tables SET
      status           = 'available',
      current_order_id = NULL,
      current_guests   = 0,
      occupied_at      = NULL,
      updated_at       = NOW()
    WHERE id = NEW.table_id;
  END IF;

  -- When order is cancelled → release table
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT NULL AND NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
    UPDATE public.restaurant_tables SET
      status           = 'available',
      current_order_id = NULL,
      current_guests   = 0,
      occupied_at      = NULL,
      updated_at       = NOW()
    WHERE id = NEW.table_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Attach the trigger to pos_orders (it was missing!)
DROP TRIGGER IF EXISTS on_order_table_status ON public.pos_orders;
CREATE TRIGGER on_order_table_status
  AFTER INSERT OR UPDATE ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_table_status_on_order();
