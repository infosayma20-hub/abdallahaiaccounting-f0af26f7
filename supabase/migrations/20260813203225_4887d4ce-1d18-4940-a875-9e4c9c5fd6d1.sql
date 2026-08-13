-- 1) Ensure each tenant that has warehouses has exactly one default warehouse
WITH pick AS (
  SELECT DISTINCT ON (w.user_id) w.user_id, w.id
  FROM public.warehouses w
  WHERE NOT EXISTS (
    SELECT 1 FROM public.warehouses d WHERE d.user_id = w.user_id AND d.is_default
  )
  ORDER BY w.user_id,
           (w.warehouse_type = 'main') DESC,
           w.is_active DESC,
           w.created_at ASC
)
UPDATE public.warehouses w
SET is_default = true, updated_at = now()
FROM pick
WHERE w.id = pick.id;

-- 2) Backfill untagged stock movements onto the tenant's default warehouse
UPDATE public.stock_movements sm
SET warehouse_id = w.id
FROM public.warehouses w
WHERE sm.warehouse_id IS NULL
  AND w.user_id = sm.user_id
  AND w.is_default;

-- 3) Prevent future untagged movements
CREATE OR REPLACE FUNCTION public.tg_stock_movement_default_warehouse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.warehouse_id IS NULL THEN
    SELECT w.id INTO NEW.warehouse_id
    FROM public.warehouses w
    WHERE w.user_id = NEW.user_id AND w.is_default
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_stock_movement_default_warehouse ON public.stock_movements;
CREATE TRIGGER trg_a_stock_movement_default_warehouse
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.tg_stock_movement_default_warehouse();

-- 4) Make the warehouse stock view resilient: unassigned movements fall to the default warehouse
CREATE OR REPLACE VIEW public.product_warehouse_stock AS
SELECT p.user_id,
       p.id   AS product_id,
       p.name AS product_name,
       p.unit,
       w.id   AS warehouse_id,
       w.name AS warehouse_name,
       w.warehouse_type,
       w.sales_rep_id,
       COALESCE(sum(
         CASE
           WHEN sm.movement_type = 'وارد'::stock_movement_type THEN sm.quantity
           WHEN sm.movement_type = 'صادر'::stock_movement_type THEN - sm.quantity
           WHEN sm.movement_type = 'تعديل يدوي'::stock_movement_type THEN sm.quantity
           ELSE 0::numeric
         END), 0::numeric) AS quantity_on_hand,
       count(sm.id) AS movement_count,
       max(sm.created_at) AS last_movement_at
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.stock_movements sm
  ON sm.product_id = p.id
 AND sm.user_id = p.user_id
 AND (sm.warehouse_id = w.id OR (sm.warehouse_id IS NULL AND w.is_default))
WHERE p.user_id = w.user_id
GROUP BY p.user_id, p.id, p.name, p.unit, w.id, w.name, w.warehouse_type, w.sales_rep_id;