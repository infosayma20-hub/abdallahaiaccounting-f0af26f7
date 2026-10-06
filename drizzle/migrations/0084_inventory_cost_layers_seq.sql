ALTER TABLE public.inventory_cost_layers ADD COLUMN IF NOT EXISTS seq bigserial;
DROP INDEX IF EXISTS public.idx_icl_fifo;
CREATE INDEX IF NOT EXISTS idx_icl_fifo ON public.inventory_cost_layers(product_id, warehouse_id, received_at, seq) WHERE qty_remaining > 0;

DO $PATCH$
DECLARE v text;
BEGIN
  SELECT pg_get_functiondef('public._inv_cost_apply_movement(public.stock_movements,text)'::regprocedure) INTO v;
  IF position('ORDER BY received_at, created_at FOR UPDATE' IN v) = 0 THEN RAISE EXCEPTION 'anchor fifo order'; END IF;
  v := replace(v, 'ORDER BY received_at, created_at FOR UPDATE', 'ORDER BY received_at, seq FOR UPDATE');
  EXECUTE v;
END $PATCH$;
