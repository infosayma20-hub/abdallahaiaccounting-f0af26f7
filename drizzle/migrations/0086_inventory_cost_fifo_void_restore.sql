DO $PATCH$
DECLARE v text;
BEGIN
  SELECT pg_get_functiondef('public._inv_cost_apply_movement(public.stock_movements,text)'::regprocedure) INTO v;

  IF position($O$  v_new_qty numeric; v_new_val numeric; v_new_avg numeric;$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor decl'; END IF;
  v := replace(v, $O$  v_new_qty numeric; v_new_val numeric; v_new_avg numeric;$O$,
    $N$  v_new_qty numeric; v_new_val numeric; v_new_avg numeric;
  v_orig uuid; v_orig_entry uuid; c record; v_rl uuid[] := '{}'; v_rq numeric[] := '{}'; v_ru numeric[] := '{}'; k int;$N$);

  IF position($O$      IF v_need > 0 THEN
        INSERT INTO public.inventory_cost_layers(user_id, product_id, warehouse_id, movement_id, received_at, qty_in, qty_remaining, unit_cost)$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor layer'; END IF;
  v := replace(v, $O$      IF v_need > 0 THEN
        INSERT INTO public.inventory_cost_layers(user_id, product_id, warehouse_id, movement_id, received_at, qty_in, qty_remaining, unit_cost)$O$,
    $N$      -- Invoice void under FIFO: put goods back into the exact layers they left
      IF v_need > 0 AND _mv.reference_type = 'invoice_void' AND COALESCE(_mv.notes,'') LIKE 'reverse_of:%' THEN
        BEGIN v_orig := substring(_mv.notes from 12 for 36)::uuid; EXCEPTION WHEN others THEN v_orig := NULL; END;
        SELECT id INTO v_orig_entry FROM public.inventory_cost_entries
         WHERE movement_id = v_orig AND entry_type = 'out' AND warehouse_id = v_wh ORDER BY seq DESC LIMIT 1;
        IF v_orig_entry IS NOT NULL THEN
          FOR c IN SELECT cc.layer_id, SUM(cc.quantity) q, MAX(cc.unit_cost) u
                     FROM public.inventory_cost_consumptions cc WHERE cc.entry_id = v_orig_entry
                    GROUP BY cc.layer_id HAVING SUM(cc.quantity) > 0 LOOP
            EXIT WHEN v_need <= 0;
            v_take := LEAST(v_need, c.q);
            UPDATE public.inventory_cost_layers SET qty_remaining = qty_remaining + v_take WHERE id = c.layer_id;
            v_rl := v_rl || c.layer_id; v_rq := v_rq || v_take; v_ru := v_ru || c.u;
            v_need := v_need - v_take;
          END LOOP;
        END IF;
      END IF;
      IF v_need > 0 THEN
        INSERT INTO public.inventory_cost_layers(user_id, product_id, warehouse_id, movement_id, received_at, qty_in, qty_remaining, unit_cost)$N$);

  IF position($O$      v_qty, v_unit, v_total, v_src, b.quantity < 0, v_var,
      v_new_qty, round(v_new_val,6), round(v_new_avg,6), _mv.reference_type, _mv.reference_id, _mv.reference_line_id, _mv.created_at);$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor in-entry'; END IF;
  v := replace(v, $O$      v_qty, v_unit, v_total, v_src, b.quantity < 0, v_var,
      v_new_qty, round(v_new_val,6), round(v_new_avg,6), _mv.reference_type, _mv.reference_id, _mv.reference_line_id, _mv.created_at);$O$,
    $N$      v_qty, v_unit, v_total, v_src, b.quantity < 0, v_var,
      v_new_qty, round(v_new_val,6), round(v_new_avg,6), _mv.reference_type, _mv.reference_id, _mv.reference_line_id, _mv.created_at);
    -- negative consumption rows = layers restored by this receipt (used by reversal)
    FOR k IN 1..COALESCE(array_length(v_rl,1),0) LOOP
      INSERT INTO public.inventory_cost_consumptions(user_id, entry_id, layer_id, quantity, unit_cost)
      VALUES (_mv.user_id, v_entry, v_rl[k], -v_rq[k], v_ru[k]);
    END LOOP;$N$);
  EXECUTE v;

  SELECT pg_get_functiondef('public._inv_cost_reverse_movement(uuid)'::regprocedure) INTO v;
  IF position($O$        UPDATE public.inventory_cost_layers SET qty_remaining = 0 WHERE movement_id = _movement_id;$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor reverse'; END IF;
  v := replace(v, $O$        UPDATE public.inventory_cost_layers SET qty_remaining = 0 WHERE movement_id = _movement_id;$O$,
    $N$        UPDATE public.inventory_cost_layers SET qty_remaining = 0 WHERE movement_id = _movement_id;
        FOR c IN SELECT * FROM public.inventory_cost_consumptions WHERE entry_id = e.id AND quantity < 0 LOOP
          UPDATE public.inventory_cost_layers SET qty_remaining = GREATEST(qty_remaining + c.quantity, 0) WHERE id = c.layer_id;
        END LOOP;$N$);
  EXECUTE v;
END $PATCH$;
