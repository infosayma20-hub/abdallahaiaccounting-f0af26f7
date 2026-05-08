
-- V3: Fix _pos_sync_stock_movements ON CONFLICT to match the partial unique index
-- idx_stock_movements_pos_order_line_idem on (reference_type, reference_id)
--   WHERE reference_type IN ('pos_order_line_sale','pos_order_line_return')
--     AND reference_id IS NOT NULL
-- PostgreSQL cannot infer a partial unique index without repeating its predicate
-- in the ON CONFLICT clause, so we add the matching WHERE to enable arbiter inference.
-- Function signature is preserved; behavior unchanged for sale and return paths.
CREATE OR REPLACE FUNCTION public._pos_sync_stock_movements(p_order_id uuid, p_user_id uuid, p_is_return boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref_type text := CASE WHEN p_is_return
                          THEN 'pos_order_line_return'
                          ELSE 'pos_order_line_sale' END;
  v_mvt      text := CASE WHEN p_is_return THEN 'وارد' ELSE 'صادر' END;
  v_warehouse uuid;
  v_branch_id uuid;
BEGIN
  SELECT t.branch_id INTO v_branch_id
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE o.id = p_order_id;

  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse
    FROM public.warehouses
    WHERE user_id = p_user_id AND branch_id = v_branch_id
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.stock_movements (
    user_id, product_id, movement_type, quantity,
    reference_type, reference_id, reference_note,
    warehouse_id, unit_cost
  )
  SELECT
    p_user_id, l.product_id, v_mvt::stock_movement_type, l.qty,
    v_ref_type, l.id,
    CASE WHEN p_is_return THEN 'POS Return' ELSE 'POS Sale' END,
    v_warehouse, l.cost_price
  FROM public.pos_order_lines l
  WHERE l.order_id = p_order_id
    AND l.product_id IS NOT NULL
    AND l.qty > 0
  -- Match the partial unique index predicate so the arbiter can be inferred
  ON CONFLICT (reference_type, reference_id)
    WHERE reference_type IN ('pos_order_line_sale', 'pos_order_line_return')
      AND reference_id IS NOT NULL
  DO NOTHING;
END;
$function$;
