CREATE OR REPLACE FUNCTION public.orders_autoset_delivered()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.total,0) > 0
     AND COALESCE(NEW.paid_amount,0) >= COALESCE(NEW.total,0) - 0.01
     AND NEW.status NOT IN ('ملغي','مرتجع','تم التسليم') THEN
    NEW.status := 'تم التسليم';
    NEW.payment_status := 'مدفوع';
    NEW.remaining_amount := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_autoset_delivered ON public.orders;
CREATE TRIGGER trg_orders_autoset_delivered
BEFORE INSERT OR UPDATE OF paid_amount, total, status, payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_autoset_delivered();