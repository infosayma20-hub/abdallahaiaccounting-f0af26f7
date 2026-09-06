CREATE OR REPLACE VIEW public.product_warehouse_stock AS
SELECT
  p.user_id,
  p.id            AS product_id,
  p.name          AS product_name,
  p.unit,
  w.id            AS warehouse_id,
  w.name          AS warehouse_name,
  w.warehouse_type,
  w.sales_rep_id,
  agg.quantity_on_hand,
  agg.movement_count,
  agg.last_movement_at
FROM (
  SELECT
    sm.user_id,
    sm.product_id,
    COALESCE(sm.warehouse_id, dw.id) AS warehouse_id,
    COALESCE(sum(
      CASE
        WHEN sm.movement_type = 'وارد'::stock_movement_type THEN sm.quantity
        WHEN sm.movement_type = 'صادر'::stock_movement_type THEN - sm.quantity
        WHEN sm.movement_type = 'تعديل يدوي'::stock_movement_type THEN sm.quantity
        ELSE 0::numeric
      END), 0::numeric) AS quantity_on_hand,
    count(sm.id)        AS movement_count,
    max(sm.created_at)  AS last_movement_at
  FROM public.stock_movements sm
  LEFT JOIN LATERAL (
    SELECT w2.id FROM public.warehouses w2
    WHERE w2.user_id = sm.user_id AND w2.is_default
    LIMIT 1
  ) dw ON sm.warehouse_id IS NULL
  GROUP BY sm.user_id, sm.product_id, COALESCE(sm.warehouse_id, dw.id)
) agg
JOIN public.products   p ON p.id = agg.product_id   AND p.user_id = agg.user_id
JOIN public.warehouses w ON w.id = agg.warehouse_id AND w.user_id = agg.user_id;

ALTER VIEW public.product_warehouse_stock SET (security_invoker = true);
REVOKE ALL ON public.product_warehouse_stock FROM anon;
GRANT SELECT ON public.product_warehouse_stock TO authenticated;
GRANT SELECT ON public.product_warehouse_stock TO service_role;