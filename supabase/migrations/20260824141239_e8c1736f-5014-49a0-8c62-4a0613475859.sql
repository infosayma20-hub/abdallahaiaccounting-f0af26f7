CREATE OR REPLACE FUNCTION public.get_product_profitability(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH owner AS (
  SELECT public.get_team_owner_id(auth.uid()) AS oid
),
deleted_tx AS MATERIALIZED (
  SELECT t.id FROM public.transactions t CROSS JOIN owner
  WHERE auth.uid() IS NOT NULL AND t.user_id = owner.oid AND t.is_deleted = true
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
    AND o.state = 'paid'
    AND COALESCE(o.is_return, false) = false
    AND dt1.id IS NULL AND dt2.id IS NULL
),
pos_agg AS (
  SELECT
    l.product_id,
    COALESCE(NULLIF(l.product_name, ''), 'غير محدد') AS name,
    SUM(l.qty)::numeric AS qty,
    SUM(l.total)::numeric AS revenue,
    SUM(COALESCE(l.cost_price,0) * l.qty)::numeric AS cost,
    bool_or(l.cost_price IS NULL) AS missing_cost
  FROM paid p
  JOIN public.pos_order_lines l ON l.order_id = p.id
  GROUP BY 1, 2
),
inv_agg AS (
  SELECT
    ii.product_id,
    COALESCE(NULLIF(ii.product_name, ''), 'غير محدد') AS name,
    SUM(ii.quantity * (CASE WHEN COALESCE(i.is_credit_note,false) THEN -1 ELSE 1 END))::numeric AS qty,
    SUM(ii.total_amount * (CASE WHEN COALESCE(i.is_credit_note,false) THEN -1 ELSE 1 END))::numeric AS revenue,
    SUM(COALESCE(ii.cost_price, 0) * ii.quantity * (CASE WHEN COALESCE(i.is_credit_note,false) THEN -1 ELSE 1 END))::numeric AS cost,
    bool_or(ii.cost_price IS NULL) AS missing_cost
  FROM public.invoices i
  CROSS JOIN owner
  JOIN public.invoice_items ii ON ii.invoice_id = i.id
  WHERE auth.uid() IS NOT NULL
    AND i.user_id = owner.oid
    AND i.invoice_type IN ('sale','sales')
    AND COALESCE(i.is_voided, false) = false
    AND COALESCE(i.status, '') NOT IN ('cancelled','void','reversed')
    AND i.invoice_date BETWEEN p_from AND p_to
  GROUP BY 1, 2
),
unioned AS (
  SELECT product_id, name, qty, revenue, cost, missing_cost, 'pos'::text AS src FROM pos_agg
  UNION ALL
  SELECT product_id, name, qty, revenue, cost, missing_cost, 'invoice'::text FROM inv_agg
),
merged AS (
  SELECT
    COALESCE(u.product_id::text, 'name:' || u.name) AS key,
    (array_agg(u.product_id) FILTER (WHERE u.product_id IS NOT NULL))[1] AS product_id,
    (array_agg(u.name))[1] AS name,
    SUM(u.qty) AS qty,
    SUM(u.revenue) AS revenue,
    SUM(u.cost) AS cost,
    bool_or(u.missing_cost) AS missing_cost,
    SUM(CASE WHEN u.src = 'pos' THEN u.revenue ELSE 0 END) AS pos_revenue,
    SUM(CASE WHEN u.src = 'invoice' THEN u.revenue ELSE 0 END) AS invoice_revenue
  FROM unioned u
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'productId', m.product_id,
  'name', m.name,
  'sku', pr.sku,
  'category', pr.category,
  'qty', m.qty,
  'revenue', m.revenue,
  'cost', m.cost,
  'profit', m.revenue - m.cost,
  'marginPct', CASE WHEN m.revenue <> 0 THEN ROUND(((m.revenue - m.cost) / m.revenue) * 100, 2) ELSE 0 END,
  'missingCost', m.missing_cost,
  'posRevenue', m.pos_revenue,
  'invoiceRevenue', m.invoice_revenue,
  'currentStock', COALESCE(pr.quantity, 0),
  'buyPrice', COALESCE(pr.buy_price, 0),
  'sellPrice', COALESCE(pr.sell_price, 0)
) ORDER BY (m.revenue - m.cost) DESC), '[]'::jsonb)
FROM merged m
LEFT JOIN public.products pr ON pr.id = m.product_id;
$function$;