CREATE OR REPLACE FUNCTION public.inventory_periodic_closing_value(_period_start date, _period_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := COALESCE(public.get_team_owner_id(auth.uid()), auth.uid());
  s record; v_open numeric := 0; v_close numeric := 0; v_lines int := 0;
  v_start timestamptz; v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT (v_owner = auth.uid() OR public.is_team_member(auth.uid(), v_owner)) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT costing_engine_enabled, inventory_valuation_method INTO s FROM public.company_settings WHERE user_id = v_owner;
  IF NOT COALESCE(s.costing_engine_enabled,false) THEN RETURN jsonb_build_object('enabled', false); END IF;
  v_start := (_period_start::timestamp AT TIME ZONE 'Asia/Hebron');
  v_end   := ((_period_end + 1)::timestamp AT TIME ZONE 'Asia/Hebron');

  WITH pw AS (
    SELECT DISTINCT product_id, warehouse_id FROM public.inventory_cost_entries WHERE user_id = v_owner
  ), snap AS (
    SELECT pw.product_id, pw.warehouse_id,
      COALESCE((SELECT e.balance_qty_after FROM public.inventory_cost_entries e WHERE e.user_id = v_owner AND e.product_id = pw.product_id AND e.warehouse_id = pw.warehouse_id AND e.movement_at < v_start ORDER BY e.seq DESC LIMIT 1),0) oq,
      COALESCE((SELECT e.balance_value_after FROM public.inventory_cost_entries e WHERE e.user_id = v_owner AND e.product_id = pw.product_id AND e.warehouse_id = pw.warehouse_id AND e.movement_at < v_start ORDER BY e.seq DESC LIMIT 1),0) ov,
      COALESCE((SELECT e.balance_qty_after FROM public.inventory_cost_entries e WHERE e.user_id = v_owner AND e.product_id = pw.product_id AND e.warehouse_id = pw.warehouse_id AND e.movement_at < v_end ORDER BY e.seq DESC LIMIT 1),0) cq,
      COALESCE((SELECT e.balance_value_after FROM public.inventory_cost_entries e WHERE e.user_id = v_owner AND e.product_id = pw.product_id AND e.warehouse_id = pw.warehouse_id AND e.movement_at < v_end ORDER BY e.seq DESC LIMIT 1),0) cv
    FROM pw
  ), prod AS (
    SELECT s2.product_id, SUM(s2.oq) oq, SUM(s2.ov) ov, SUM(s2.cq) cq, SUM(s2.cv) cv,
      COALESCE((SELECT SUM(e.quantity) FROM public.inventory_cost_entries e WHERE e.user_id = v_owner AND e.product_id = s2.product_id
                 AND e.entry_type = 'in' AND e.reversed_at IS NULL AND e.movement_at >= v_start AND e.movement_at < v_end
                 AND COALESCE(e.reference_type,'') NOT IN ('stock_transfer','stock_transfer_cancel')),0) rq,
      COALESCE((SELECT SUM(e.total_cost) FROM public.inventory_cost_entries e WHERE e.user_id = v_owner AND e.product_id = s2.product_id
                 AND e.entry_type = 'in' AND e.reversed_at IS NULL AND e.movement_at >= v_start AND e.movement_at < v_end
                 AND COALESCE(e.reference_type,'') NOT IN ('stock_transfer','stock_transfer_cancel')),0) rv
    FROM snap s2 GROUP BY s2.product_id
  )
  SELECT COALESCE(SUM(GREATEST(ov,0)),0),
         COALESCE(SUM(CASE
           WHEN cq <= 0 THEN 0
           WHEN s.inventory_valuation_method = 'weighted_avg_period' AND (GREATEST(oq,0) + rq) > 0
             THEN cq * (GREATEST(ov,0) + rv) / (GREATEST(oq,0) + rq)
           ELSE cv END),0),
         COUNT(*) FILTER (WHERE cq > 0)
    INTO v_open, v_close, v_lines
    FROM prod;

  RETURN jsonb_build_object('enabled', true, 'method', s.inventory_valuation_method,
    'opening_value', round(v_open,2), 'closing_value', round(v_close,2), 'lines', v_lines);
END $$;
GRANT EXECUTE ON FUNCTION public.inventory_periodic_closing_value(date, date) TO authenticated;
