-- 1) Recalculate products.quantity from the authoritative stock_movements ledger
CREATE OR REPLACE FUNCTION public.recalc_product_quantity(_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid;
  v_cnt   bigint;
  v_qty   numeric;
BEGIN
  SELECT user_id INTO v_owner FROM public.products WHERE id = _product_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF v_owner <> public.get_team_owner_id() THEN
    RAISE EXCEPTION 'Not authorized for this product';
  END IF;

  SELECT count(*),
         COALESCE(SUM(CASE
           WHEN movement_type = 'وارد'::stock_movement_type THEN quantity
           WHEN movement_type = 'صادر'::stock_movement_type THEN -quantity
           WHEN movement_type = 'تعديل يدوي'::stock_movement_type THEN quantity
           ELSE 0 END), 0)
    INTO v_cnt, v_qty
    FROM public.stock_movements
   WHERE product_id = _product_id;

  -- Products with no movement at all keep their manually entered quantity
  IF v_cnt = 0 THEN
    SELECT quantity INTO v_qty FROM public.products WHERE id = _product_id;
    RETURN COALESCE(v_qty, 0);
  END IF;

  UPDATE public.products
     SET quantity = v_qty, updated_at = now()
   WHERE id = _product_id;

  RETURN v_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_product_quantity(uuid) TO authenticated;

-- 2) Post a manual quantity adjustment on a warehouse and resync the product card
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  _product_id uuid,
  _warehouse_id uuid,
  _delta numeric,
  _note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    reference_type, reference_note, unit_cost, created_by
  ) VALUES (
    v_owner, _product_id, _warehouse_id,
    (CASE WHEN _delta > 0 THEN 'وارد' ELSE 'صادر' END)::stock_movement_type,
    abs(_delta),
    'manual_adjustment',
    COALESCE(_note, 'تسوية كمية من بطاقة الصنف'),
    v_cost,
    auth.uid()
  );

  RETURN public.recalc_product_quantity(_product_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, uuid, numeric, text) TO authenticated;

-- 3) One-off repair for the reporting tenant (Top Car): realign product cards
--    with their actual movement ledger.
UPDATE public.products p
   SET quantity = d.derived, updated_at = now()
  FROM (
    SELECT m.product_id,
           SUM(CASE
             WHEN m.movement_type = 'وارد'::stock_movement_type THEN m.quantity
             WHEN m.movement_type = 'صادر'::stock_movement_type THEN -m.quantity
             WHEN m.movement_type = 'تعديل يدوي'::stock_movement_type THEN m.quantity
             ELSE 0 END) AS derived
      FROM public.stock_movements m
     GROUP BY m.product_id
  ) d
 WHERE d.product_id = p.id
   AND p.user_id = '692bb222-cb54-43cf-b0af-2458b682743d'
   AND p.quantity IS DISTINCT FROM d.derived;