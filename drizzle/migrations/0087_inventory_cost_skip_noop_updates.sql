DO $PATCH$
DECLARE v text;
BEGIN
  SELECT pg_get_functiondef('public.tg_inventory_costing_engine()'::regprocedure) INTO v;
  IF position($O$  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public._inv_cost_reverse_movement(OLD.id);$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor tg'; END IF;
  v := replace(v, $O$  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public._inv_cost_reverse_movement(OLD.id);$O$, $N$  IF TG_OP = 'UPDATE'
     AND (NEW.product_id, NEW.warehouse_id, NEW.movement_type, NEW.quantity, NEW.unit_cost)
         IS NOT DISTINCT FROM (OLD.product_id, OLD.warehouse_id, OLD.movement_type, OLD.quantity, OLD.unit_cost) THEN
    RETURN NULL;  -- no cost-relevant change
  END IF;

  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public._inv_cost_reverse_movement(OLD.id);$N$);
  EXECUTE v;
END $PATCH$;
