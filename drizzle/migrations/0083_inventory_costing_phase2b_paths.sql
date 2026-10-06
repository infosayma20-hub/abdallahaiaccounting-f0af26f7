-- Phase 2b: transfers carry cost, voids/adjustments use correct cost, adjustments post GL, rep sales no double COGS

CREATE OR REPLACE FUNCTION public._inv_cost_receipt_unit_cost(_mv public.stock_movements, _fallback numeric, OUT unit_cost numeric, OUT source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record; v_net numeric; v_rate numeric; v_orig uuid; v_c numeric;
BEGIN
  -- Transfers: destination receives exactly the source cost
  IF _mv.reference_type IN ('stock_transfer','stock_transfer_cancel') AND _mv.reference_line_id IS NOT NULL THEN
    SELECT e.unit_cost INTO v_c FROM public.inventory_cost_entries e
     WHERE e.reference_type = 'stock_transfer' AND e.reference_line_id = _mv.reference_line_id
       AND e.product_id = _mv.product_id AND e.entry_type = 'out'
       AND (_mv.reference_type = 'stock_transfer_cancel' OR e.reversed_at IS NULL)
     ORDER BY e.created_at DESC LIMIT 1;
    IF v_c IS NOT NULL THEN unit_cost := v_c; source := 'transfer'; RETURN; END IF;
  END IF;

  -- Invoice void: goods come back at the cost they left with
  IF _mv.reference_type = 'invoice_void' AND COALESCE(_mv.notes,'') LIKE 'reverse_of:%' THEN
    BEGIN
      v_orig := substring(_mv.notes from 12 for 36)::uuid;
    EXCEPTION WHEN others THEN v_orig := NULL;
    END;
    IF v_orig IS NOT NULL THEN
      SELECT e.unit_cost INTO v_c FROM public.inventory_cost_entries e
       WHERE e.movement_id = v_orig AND e.entry_type IN ('in','out') ORDER BY e.created_at DESC LIMIT 1;
      IF v_c IS NOT NULL THEN unit_cost := v_c; source := 'original_movement'; RETURN; END IF;
    END IF;
  END IF;

  -- Count/adjustment gains are valued at the current average (IAS 2), not a typed price
  IF _mv.reference_type IN ('manual_adjustment','stock_count') AND COALESCE(_fallback,0) > 0 THEN
    unit_cost := _fallback; source := 'current_cost'; RETURN;
  END IF;

  IF COALESCE(_mv.unit_cost, 0) > 0 THEN
    unit_cost := _mv.unit_cost; source := 'movement'; RETURN;
  END IF;

  IF _mv.reference_type IN ('invoice','purchase_invoice') AND _mv.reference_line_id IS NOT NULL THEN
    SELECT ii.quantity, ii.unit_price, ii.discount, ii.discount_type, i.invoice_type, i.currency, i.exchange_rate
      INTO v_item
      FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
     WHERE ii.id = _mv.reference_line_id;
    IF FOUND AND v_item.invoice_type = 'purchase' AND COALESCE(v_item.unit_price,0) > 0 THEN
      IF COALESCE(v_item.discount,0) = 0 THEN
        v_net := v_item.unit_price;
      ELSIF lower(COALESCE(v_item.discount_type,'')) IN ('percent','percentage','%','pct') THEN
        v_net := v_item.unit_price * (1 - v_item.discount / 100.0);
      ELSIF COALESCE(v_item.quantity,0) > 0 THEN
        v_net := (v_item.quantity * v_item.unit_price - v_item.discount) / v_item.quantity;
      ELSE
        v_net := v_item.unit_price;
      END IF;
      v_rate := CASE WHEN COALESCE(v_item.currency,'شيكل') IN ('شيكل','ILS','₪') THEN 1
                     ELSE NULLIF(v_item.exchange_rate,0) END;
      IF v_rate IS NOT NULL AND v_net > 0 THEN
        unit_cost := round(v_net * v_rate, 6); source := 'purchase_invoice'; RETURN;
      END IF;
    END IF;
  END IF;

  unit_cost := COALESCE(_fallback, 0); source := 'current_cost';
END $$;
REVOKE ALL ON FUNCTION public._inv_cost_receipt_unit_cost(public.stock_movements, numeric) FROM PUBLIC, anon, authenticated;

DO $PATCH$
DECLARE v text;
BEGIN
  -- 1) adjustment account role
  SELECT pg_get_functiondef('public._inv_cost_account(uuid,text)'::regprocedure) INTO v;
  IF position($O$  ELSE
    RAISE EXCEPTION 'دور حساب غير معروف: %', _role;$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor _inv_cost_account'; END IF;
  v := replace(v, $O$  ELSE
    RAISE EXCEPTION 'دور حساب غير معروف: %', _role;$O$, $N$  ELSIF _role = 'adjustment' THEN
    v_sys_role := 'inventory_adjustment'; v_parent := '5100'; v_name := 'تسويات وجرد المخزون (عجز/زيادة)';
    v_cands := ARRAY['5109','5104','5105','5106','5107','5108'];
  ELSE
    RAISE EXCEPTION 'دور حساب غير معروف: %', _role;$N$);
  EXECUTE v;

  -- 2) adjustments / counts post GL
  SELECT pg_get_functiondef('public._inv_cost_post_gl(uuid)'::regprocedure) INTO v;
  IF position($O$  ELSE
    RETURN;
  END IF;

  IF e.total_cost > 0 THEN$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor _inv_cost_post_gl'; END IF;
  v := replace(v, $O$  ELSE
    RETURN;
  END IF;

  IF e.total_cost > 0 THEN$O$, $N$  ELSIF e.reference_type IN ('manual_adjustment','stock_count') THEN
    IF e.entry_type = 'in' THEN
      v_dr := v_inv; v_cr := public._inv_cost_account(e.user_id, 'adjustment'); v_desc := 'زيادة مخزون - تسوية/جرد';
    ELSE
      v_dr := public._inv_cost_account(e.user_id, 'adjustment'); v_cr := v_inv; v_desc := 'عجز مخزون - تسوية/جرد';
    END IF;
  ELSE
    RETURN;
  END IF;

  IF e.total_cost > 0 THEN$N$);
  EXECUTE v;

  -- 3) prepare_accounts includes adjustment
  SELECT pg_get_functiondef('public._inv_cost_prepare_accounts(uuid)'::regprocedure) INTO v;
  IF position($O$'variance', public._inv_cost_account(_owner, 'variance'),$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor prepare'; END IF;
  v := replace(v, $O$'variance', public._inv_cost_account(_owner, 'variance'),$O$, $N$'variance', public._inv_cost_account(_owner, 'variance'),
    'adjustment', public._inv_cost_account(_owner, 'adjustment'),$N$);
  EXECUTE v;

  -- 4) transfers carry references so the destination gets the source cost
  SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p WHERE p.proname = 'confirm_stock_transfer' AND p.pronamespace = 'public'::regnamespace;
  IF position($O$INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)$O$ IN v) = 0
     OR position($O$      'تحويل ' || v_transfer.transfer_number
    );$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor confirm_stock_transfer'; END IF;
  v := replace(v, $O$INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)$O$,
                  $N$INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note, reference_type, reference_id, reference_line_id)$N$);
  v := replace(v, $O$      'تحويل ' || v_transfer.transfer_number
    );$O$, $N$      'تحويل ' || v_transfer.transfer_number,
      'stock_transfer', v_transfer.id, v_item.id
    );$N$);
  EXECUTE v;

  SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p WHERE p.proname = 'cancel_stock_transfer' AND p.pronamespace = 'public'::regnamespace;
  IF position($O$INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)$O$ IN v) = 0
     OR position($O$        'إلغاء تحويل ' || v_transfer.transfer_number
      );$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor cancel_stock_transfer'; END IF;
  v := replace(v, $O$INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)$O$,
                  $N$INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note, reference_type, reference_id, reference_line_id)$N$);
  v := replace(v, $O$        'إلغاء تحويل ' || v_transfer.transfer_number
      );$O$, $N$        'إلغاء تحويل ' || v_transfer.transfer_number,
        'stock_transfer_cancel', v_transfer.id, v_item.id
      );$N$);
  EXECUTE v;

  -- 5) rep sales: engine owns COGS when enabled (no double posting)
  SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p WHERE p.proname = 'create_rep_sale_atomic' AND p.pronamespace = 'public'::regnamespace;
  IF position($O$  IF v_total_cost > 0 THEN
    v_cogs_key$O$ IN v) = 0 THEN RAISE EXCEPTION 'anchor create_rep_sale_atomic'; END IF;
  v := replace(v, $O$  IF v_total_cost > 0 THEN
    v_cogs_key$O$, $N$  IF v_total_cost > 0 AND public._inv_cost_mode(p_user_id) IS NULL THEN
    v_cogs_key$N$);
  EXECUTE v;
END $PATCH$;
