-- Attach the existing handle_returns_stock function as an AFTER UPDATE trigger
-- on public.returns so confirming/un-confirming a return automatically
-- adjusts product stock. Function already exists; this just wires it up.

DROP TRIGGER IF EXISTS trg_returns_stock_on_status ON public.returns;

CREATE TRIGGER trg_returns_stock_on_status
AFTER UPDATE OF status ON public.returns
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.handle_returns_stock();