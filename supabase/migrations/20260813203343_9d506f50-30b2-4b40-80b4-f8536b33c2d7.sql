-- Reconcile: create opening-balance movements so movement sums equal products.quantity
CREATE TEMP TABLE _recon ON COMMIT DROP AS
SELECT p.id AS product_id,
       p.user_id,
       p.quantity AS target_qty,
       p.created_at,
       (SELECT w.id FROM public.warehouses w WHERE w.user_id = p.user_id AND w.is_default LIMIT 1) AS wh,
       p.quantity - COALESCE((
         SELECT sum(CASE WHEN sm.movement_type = 'وارد' THEN sm.quantity
                         WHEN sm.movement_type = 'صادر' THEN -sm.quantity
                         ELSE sm.quantity END)
         FROM public.stock_movements sm WHERE sm.product_id = p.id), 0) AS diff
FROM public.products p
WHERE EXISTS (SELECT 1 FROM public.warehouses w WHERE w.user_id = p.user_id AND w.is_default);

DELETE FROM _recon WHERE diff = 0 OR wh IS NULL;

INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_note, created_at)
SELECT user_id, product_id, 'تعديل يدوي'::stock_movement_type, diff, wh, 'opening_balance', 'رصيد افتتاحي (مطابقة بطاقة الصنف)', created_at
FROM _recon;

-- The sync trigger doubled the quantity; restore the exact original value
UPDATE public.products p SET quantity = r.target_qty
FROM _recon r WHERE p.id = r.product_id;

-- Keep the two sources aligned going forward -------------------------------
CREATE OR REPLACE FUNCTION public.tg_sync_product_qty_from_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC;
BEGIN
  PERFORM set_config('app.stock_sync', 'on', true);
  IF TG_OP = 'INSERT' THEN
    IF NEW.movement_type = 'وارد' THEN
      v_delta := NEW.quantity;
    ELSIF NEW.movement_type = 'صادر' THEN
      v_delta := -NEW.quantity;
    ELSE
      v_delta := NEW.quantity;
    END IF;
    UPDATE public.products SET quantity = COALESCE(quantity,0) + v_delta, updated_at = now()
      WHERE id = NEW.product_id;
    PERFORM set_config('app.stock_sync', 'off', true);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.movement_type = 'وارد' THEN
      v_delta := -OLD.quantity;
    ELSIF OLD.movement_type = 'صادر' THEN
      v_delta := OLD.quantity;
    ELSE
      v_delta := -OLD.quantity;
    END IF;
    UPDATE public.products SET quantity = COALESCE(quantity,0) + v_delta, updated_at = now()
      WHERE id = OLD.product_id;
    PERFORM set_config('app.stock_sync', 'off', true);
    RETURN OLD;
  END IF;
  PERFORM set_config('app.stock_sync', 'off', true);
  RETURN NULL;
END;
$$;

-- New product with an initial quantity -> matching opening movement
CREATE OR REPLACE FUNCTION public.tg_product_initial_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh uuid;
  v_qty numeric := COALESCE(NEW.quantity, 0);
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  SELECT w.id INTO v_wh FROM public.warehouses w WHERE w.user_id = NEW.user_id AND w.is_default LIMIT 1;
  IF v_wh IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_note)
  VALUES (NEW.user_id, NEW.id, 'تعديل يدوي'::stock_movement_type, v_qty, v_wh, 'opening_balance', 'رصيد افتتاحي');
  -- undo the double-count from the sync trigger
  UPDATE public.products SET quantity = v_qty WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_initial_stock_movement ON public.products;
CREATE TRIGGER trg_product_initial_stock_movement
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.tg_product_initial_stock_movement();

-- Manual quantity edit on the product card -> matching adjustment movement
CREATE OR REPLACE FUNCTION public.tg_product_manual_qty_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wh uuid;
  v_delta numeric;
  v_target numeric := COALESCE(NEW.quantity, 0);
BEGIN
  IF current_setting('app.stock_sync', true) = 'on' THEN RETURN NEW; END IF;
  v_delta := v_target - COALESCE(OLD.quantity, 0);
  IF v_delta = 0 THEN RETURN NEW; END IF;
  SELECT w.id INTO v_wh FROM public.warehouses w WHERE w.user_id = NEW.user_id AND w.is_default LIMIT 1;
  IF v_wh IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_note)
  VALUES (NEW.user_id, NEW.id, 'تعديل يدوي'::stock_movement_type, v_delta, v_wh, 'manual_qty_edit', 'تعديل الكمية من بطاقة الصنف');
  UPDATE public.products SET quantity = v_target WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_manual_qty_movement ON public.products;
CREATE TRIGGER trg_product_manual_qty_movement
AFTER UPDATE OF quantity ON public.products
FOR EACH ROW WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
EXECUTE FUNCTION public.tg_product_manual_qty_movement();