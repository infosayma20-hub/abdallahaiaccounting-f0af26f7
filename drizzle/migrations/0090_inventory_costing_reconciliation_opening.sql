DO $PATCH$
DECLARE v text;
BEGIN
  SELECT pg_get_functiondef('public.inventory_costing_reconciliation()'::regprocedure) INTO v;
  IF position($O$'negative_lines', v_neg,$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor rec'; END IF;
  v := replace(v, $O$'negative_lines', v_neg,$O$, $N$'opening_value', (SELECT COALESCE(round(SUM(total_cost),2),0) FROM public.inventory_cost_entries WHERE user_id = v_owner AND entry_type = 'opening'),
    'negative_lines', v_neg,$N$);
  EXECUTE v;
END $PATCH$;
