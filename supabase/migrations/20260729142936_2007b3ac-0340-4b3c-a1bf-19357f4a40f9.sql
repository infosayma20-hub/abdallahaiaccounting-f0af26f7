CREATE OR REPLACE FUNCTION public.get_pos_products_report(p_from date, p_to date, p_branch uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH owner AS (
  SELECT public.get_team_owner_id(auth.uid()) AS oid
),
deleted_tx AS MATERIALIZED (
  SELECT t.id
  FROM public.transactions t
  CROSS JOIN owner
  WHERE auth.uid() IS NOT NULL
    AND t.user_id = owner.oid
    AND t.is_deleted = true
),
paid AS (
  SELECT o.id
  FROM public.pos_orders o
  CROSS JOIN owner
  LEFT JOIN deleted_tx dt1 ON dt1.id = o.transaction_id
  LEFT JOIN deleted_tx dt2 ON dt2.id = o.linked_transaction_id
  WHERE auth.uid() IS NOT NULL
    AND o.user_id = owner.oid
    AND (
      (o.business_date IS NOT NULL AND o.business_date BETWEEN p_from AND p_to)
      OR (o.business_date IS NULL AND o.created_at >= p_from::timestamptz AND o.created_at < (p_to + 1)::timestamptz)
    )
    AND (p_branch IS NULL OR o.branch_id = p_branch)
    AND o.state = 'paid'
    AND COALESCE(o.is_return, false) = false
    AND dt1.id IS NULL
    AND dt2.id IS NULL
),
agg AS (
  SELECT
    COALESCE(NULLIF(l.product_name, ''), 'غير محدد') AS name,
    (array_agg(l.product_id) FILTER (WHERE l.product_id IS NOT NULL))[1] AS product_id,
    COALESCE(SUM(l.qty), 0)::numeric AS qty,
    COALESCE(SUM(l.total), 0)::numeric AS revenue,
    COALESCE(SUM(l.cost_price * l.qty), 0)::numeric AS cost
  FROM paid p
  JOIN public.pos_order_lines l ON l.order_id = p.id
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'name', a.name,
  'productId', a.product_id,
  'qty', a.qty,
  'revenue', a.revenue,
  'cost', a.cost,
  'marginPct', pr.profit_margin_percent,
  'currentStock', COALESCE(pr.quantity, 0),
  'minQuantity', COALESCE(pr.min_quantity, 0),
  'buyPrice', COALESCE(pr.buy_price, 0)
) ORDER BY a.revenue DESC), '[]'::jsonb)
FROM agg a
CROSS JOIN owner
LEFT JOIN public.products pr
  ON pr.user_id = owner.oid
 AND (pr.id = a.product_id OR (a.product_id IS NULL AND btrim(pr.name) = btrim(a.name)))
$function$;

GRANT EXECUTE ON FUNCTION public.get_pos_products_report(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pos_products_report(date, date, uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_pos_order_lines_order_product ON public.pos_order_lines (order_id) INCLUDE (product_id, product_name, qty, total, cost_price);