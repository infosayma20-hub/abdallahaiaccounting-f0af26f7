CREATE OR REPLACE FUNCTION public.adjust_product_stock(_product_id uuid, _delta numeric, _warehouse_id uuid DEFAULT NULL, _note text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cost  numeric;
BEGIN
  IF _delta IS NULL OR _delta = 0 THEN
    RETURN public.recalc_product_quantity(_product_id);
  END IF;

  SELECT user_id, COALESCE(buy_price, 0) INTO v_owner, v_cost
    FROM public.products WHERE id = _product_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF v_owner <> public.get_team_owner_id() THEN
    RAISE EXCEPTION 'Not authorized for this product';
  END IF;
  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required for a stock adjustment';
  END IF;

  INSERT INTO public.stock_movements (
    user_id, product_id, warehouse_id, movement_type, quantity,
    reference_type, reference_note, unit_cost
  ) VALUES (
    v_owner, _product_id, _warehouse_id,
    (CASE WHEN _delta > 0 THEN 'وارد' ELSE 'صادر' END)::stock_movement_type,
    abs(_delta),
    'manual_adjustment',
    COALESCE(_note, 'تسوية كمية من بطاقة الصنف'),
    v_cost
  );

  RETURN public.recalc_product_quantity(_product_id);
END;
$$;