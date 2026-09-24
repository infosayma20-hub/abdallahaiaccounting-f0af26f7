-- products.quantity is a cache derived from stock_movements.
-- Direct client writes (authenticated/anon) overwrite ledger-driven values
-- with stale browser values (lost updates). Keep OLD.quantity for such writes.
-- SECURITY DEFINER inventory functions run as the owner role and are unaffected;
-- the stock_movements sync trigger sets app.stock_sync='on'.
CREATE OR REPLACE FUNCTION public.guard_products_quantity_direct_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.quantity IS DISTINCT FROM OLD.quantity
     AND COALESCE(current_setting('app.stock_sync', true), 'off') <> 'on'
     AND current_user IN ('authenticated', 'anon') THEN
    NEW.quantity := OLD.quantity;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_guard_products_quantity ON public.products;
CREATE TRIGGER trg_a_guard_products_quantity
BEFORE UPDATE OF quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_products_quantity_direct_write();

COMMENT ON FUNCTION public.guard_products_quantity_direct_write() IS
'products.quantity may only change through stock_movements (ledger) or SECURITY DEFINER inventory functions. Client direct writes are ignored.';