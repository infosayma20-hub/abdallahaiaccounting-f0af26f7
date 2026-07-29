DROP FUNCTION IF EXISTS public.get_pos_reports_summary(date,date,uuid);
CREATE OR REPLACE FUNCTION public.get_pos_reports_summary(p_from date, p_to date, p_branch uuid DEFAULT NULL::uuid, p_branches uuid[] DEFAULT NULL::uuid[])
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
orders_scope AS (
  SELECT
    o.id,
    o.created_at,
    COALESCE(o.business_date, o.created_at::date) AS report_day,
    o.session_id,
    o.branch_id,
    o.state,
    COALESCE(o.is_return, false) AS is_return,
    COALESCE(o.discount_amount, 0)::numeric AS discount_amount,
    CASE WHEN COALESCE(o.total_includes_delivery_fee, false)
      THEN GREATEST(0, COALESCE(o.total, 0)::numeric - COALESCE(o.delivery_fee, 0)::numeric)
      ELSE COALESCE(o.total, 0)::numeric
    END AS net_sales,
    CASE WHEN COALESCE(o.total_includes_delivery_fee, false)
      THEN COALESCE(o.total, 0)::numeric
      ELSE COALESCE(o.total, 0)::numeric + COALESCE(o.delivery_fee, 0)::numeric
    END AS collected,
    COALESCE(o.delivery_fee, 0)::numeric AS delivery_fee,
    o.customer_name
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
    AND (p_branches IS NULL OR o.branch_id = ANY(p_branches))
    AND o.state <> 'draft'
    AND dt1.id IS NULL
    AND dt2.id IS NULL
),
paid AS (
  SELECT * FROM orders_scope WHERE state = 'paid' AND NOT is_return
),
returns AS (
  SELECT * FROM orders_scope WHERE is_return AND state <> 'cancelled'
),
sessions_scope AS (
  SELECT
    s.id,
    COALESCE(s.cashier_name, 'غير محدد') AS cashier_name,
    s.cashier_pos_user_id,
    s.opened_at,
    s.branch_id,
    COALESCE(s.cash_variance, 0)::numeric AS cash_variance
  FROM public.pos_sessions s
  LEFT JOIN public.pos_users pu ON pu.id = s.cashier_pos_user_id
  CROSS JOIN owner
  WHERE auth.uid() IS NOT NULL
    AND s.user_id = owner.oid
    AND COALESCE(s.is_deleted, false) = false
    AND (
      (s.business_date IS NOT NULL AND s.business_date BETWEEN p_from AND p_to)
      OR (s.business_date IS NULL AND s.opened_at >= p_from::timestamptz AND s.opened_at < (p_to + 1)::timestamptz)
    )
    AND (p_branch IS NULL OR s.branch_id = p_branch)
    AND (p_branches IS NULL OR s.branch_id = ANY(p_branches))
    AND COALESCE(pu.is_call_center, false) = false
),
line_totals AS (
  SELECT
    COALESCE(SUM(l.cost_price * l.qty), 0)::numeric AS cogs
  FROM paid p
  JOIN public.pos_order_lines l ON l.order_id = p.id
),
payment_rows AS (
  SELECT
    COALESCE(NULLIF(p.payment_method, ''), 'نقدي') AS method,
    COALESCE(SUM(p.amount), 0)::numeric AS amount
  FROM paid o
  JOIN public.pos_payments p ON p.order_id = o.id
  GROUP BY 1
),
daily AS (
  SELECT
    d.day::date AS date,
    COUNT(p.id)::int AS orders,
    COALESCE(SUM(p.net_sales), 0)::numeric AS sales,
    COALESCE((SELECT SUM(r.net_sales) FROM returns r WHERE r.report_day = d.day), 0)::numeric AS returns,
    COALESCE(SUM(p.net_sales), 0)::numeric - COALESCE((SELECT SUM(r.net_sales) FROM returns r WHERE r.report_day = d.day), 0)::numeric AS net
  FROM generate_series(p_from, p_to, interval '1 day') AS d(day)
  LEFT JOIN paid p ON p.report_day = d.day::date
  GROUP BY d.day
),
peak AS (
  SELECT
    EXTRACT(DOW FROM (created_at AT TIME ZONE 'Asia/Jerusalem'))::int AS day,
    EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Jerusalem'))::int AS hour,
    COALESCE(SUM(net_sales), 0)::numeric AS sales
  FROM paid
  GROUP BY 1, 2
),
orders_by_session AS (
  SELECT
    s.id AS session_id,
    s.cashier_name,
    COALESCE(COUNT(p.id), 0)::int AS orders,
    COALESCE(SUM(p.net_sales), 0)::numeric AS sales,
    COALESCE(SUM(p.discount_amount), 0)::numeric AS discounts,
    COALESCE((SELECT COUNT(*) FROM returns r WHERE r.session_id = s.id), 0)::int AS returns
  FROM sessions_scope s
  LEFT JOIN paid p ON p.session_id = s.id
  GROUP BY s.id, s.cashier_name
),
cashier AS (
  SELECT
    cashier_name AS name,
    COUNT(*)::int AS shifts,
    COALESCE(SUM(orders), 0)::int AS orders,
    COALESCE(SUM(sales), 0)::numeric AS sales,
    CASE WHEN COALESCE(SUM(orders), 0) > 0 THEN COALESCE(SUM(sales), 0)::numeric / SUM(orders) ELSE 0::numeric END AS avg_order,
    COALESCE((SELECT SUM(ss.cash_variance) FROM sessions_scope ss WHERE ss.cashier_name = obs.cashier_name), 0)::numeric AS variance,
    COALESCE(SUM(discounts), 0)::numeric AS discounts,
    COALESCE(SUM(returns), 0)::int AS returns
  FROM orders_by_session obs
  GROUP BY cashier_name
),
kpis AS (
  SELECT
    COALESCE((SELECT SUM(net_sales) FROM paid), 0)::numeric AS total_sales,
    COALESCE((SELECT SUM(net_sales) FROM returns), 0)::numeric AS total_returns,
    COALESCE((SELECT SUM(delivery_fee) FROM paid), 0)::numeric AS delivery_collected,
    COALESCE((SELECT SUM(collected) FROM paid), 0)::numeric AS customer_collected,
    COALESCE((SELECT COUNT(*) FROM paid), 0)::int AS total_orders,
    COALESCE((SELECT SUM(discount_amount) FROM paid), 0)::numeric AS total_discounts,
    COALESCE((SELECT cogs FROM line_totals), 0)::numeric AS total_cogs
)
SELECT jsonb_build_object(
  'kpis', COALESCE((SELECT to_jsonb(k) FROM kpis k), '{}'::jsonb),
  'daily', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date) FROM daily d WHERE d.orders <> 0 OR d.sales <> 0 OR d.returns <> 0), '[]'::jsonb),
  'payments', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.amount DESC) FROM payment_rows p), '[]'::jsonb),
  'cashier', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sales DESC) FROM cashier c), '[]'::jsonb),
  'peak', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.day, p.hour) FROM peak p), '[]'::jsonb),
  'from', p_from,
  'to', p_to
);
$function$;

DROP FUNCTION IF EXISTS public.get_pos_products_report(date,date,uuid);
CREATE OR REPLACE FUNCTION public.get_pos_products_report(p_from date, p_to date, p_branch uuid DEFAULT NULL::uuid, p_branches uuid[] DEFAULT NULL::uuid[])
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
    AND (p_branches IS NULL OR o.branch_id = ANY(p_branches))
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

DROP FUNCTION IF EXISTS public.get_delivery_apps_report(date,date,uuid);
CREATE OR REPLACE FUNCTION public.get_delivery_apps_report(p_from date, p_to date, p_branch uuid DEFAULT NULL::uuid, p_branches uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH owner AS (
  SELECT public.get_team_owner_id(auth.uid()) AS oid
),
cc AS (
  SELECT DISTINCT ON (c.pos_order_id) c.pos_order_id, NULLIF(btrim(c.source_app), '') AS source_app
  FROM public.call_center_orders c
  WHERE c.pos_order_id IS NOT NULL
  ORDER BY c.pos_order_id, c.created_at DESC
),
base AS (
  SELECT
    o.id,
    o.business_date,
    o.state,
    COALESCE(o.is_return, false) AS is_return,
    COALESCE(o.delivery_fee, 0)::numeric AS delivery_fee,
    CASE WHEN COALESCE(o.total_includes_delivery_fee, false)
         THEN GREATEST(0, COALESCE(o.total,0)::numeric - COALESCE(o.delivery_fee,0)::numeric)
         ELSE COALESCE(o.total,0)::numeric END AS net_sales,
    COALESCE(o.total, 0)::numeric AS collected,
    COALESCE(
      cc.source_app,
      public.pos_normalize_delivery_app(o.order_note),
      public.pos_normalize_delivery_app(o.notes)
    ) AS app
  FROM public.pos_orders o
  LEFT JOIN cc ON cc.pos_order_id = o.id
  LEFT JOIN public.transactions t ON t.id = o.transaction_id
  CROSS JOIN owner
  WHERE o.user_id = owner.oid
    AND o.business_date BETWEEN p_from AND p_to
    AND (p_branch IS NULL OR o.branch_id = p_branch)
    AND (p_branches IS NULL OR o.branch_id = ANY(p_branches))
    AND COALESCE(t.is_deleted, false) = false
    AND o.state <> 'draft'
),
filtered AS (
  SELECT * FROM base
  WHERE app IS NOT NULL
    AND upper(app) NOT IN ('KIOSK', 'DIRECT', 'POS')
    AND btrim(app) NOT IN ('طلب مباشر', 'مباشر', 'كاشير')
),
pay AS (
  SELECT
    f.id,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'cash'), 0)::numeric AS cash_amount,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method = 'card'), 0)::numeric AS card_amount,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_method NOT IN ('cash','card')), 0)::numeric AS other_amount
  FROM filtered f
  LEFT JOIN public.pos_payments p ON p.order_id = f.id
  WHERE f.state = 'paid' AND NOT f.is_return
  GROUP BY f.id
),
agg AS (
  SELECT
    f.app,
    COUNT(*) FILTER (WHERE f.state = 'paid' AND NOT f.is_return)::int AS orders,
    COALESCE(SUM(f.net_sales) FILTER (WHERE f.state = 'paid' AND NOT f.is_return), 0)::numeric AS net_sales,
    COALESCE(SUM(f.delivery_fee) FILTER (WHERE f.state = 'paid' AND NOT f.is_return), 0)::numeric AS delivery_fees,
    COALESCE(SUM(f.collected) FILTER (WHERE f.state = 'paid' AND NOT f.is_return), 0)::numeric AS collected,
    COUNT(*) FILTER (WHERE f.state = 'cancelled')::int AS cancelled_orders,
    COALESCE(SUM(f.net_sales) FILTER (WHERE f.state = 'cancelled'), 0)::numeric AS cancelled_amount,
    COUNT(*) FILTER (WHERE f.is_return)::int AS returns_orders,
    COALESCE(SUM(f.net_sales) FILTER (WHERE f.is_return), 0)::numeric AS returns_amount,
    COALESCE(SUM(pay.cash_amount), 0)::numeric AS cash_amount,
    COALESCE(SUM(pay.card_amount), 0)::numeric AS card_amount,
    COALESCE(SUM(pay.other_amount), 0)::numeric AS other_amount
  FROM filtered f
  LEFT JOIN pay ON pay.id = f.id
  GROUP BY f.app
),
daily AS (
  SELECT
    f.business_date AS day,
    f.app,
    COUNT(*) FILTER (WHERE f.state = 'paid' AND NOT f.is_return)::int AS orders,
    COALESCE(SUM(f.net_sales) FILTER (WHERE f.state = 'paid' AND NOT f.is_return), 0)::numeric AS net_sales
  FROM filtered f
  GROUP BY 1, 2
)
SELECT jsonb_build_object(
  'apps', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.net_sales DESC) FROM agg a), '[]'::jsonb),
  'daily', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day, d.app) FROM daily d), '[]'::jsonb),
  'from', p_from,
  'to', p_to
)
WHERE auth.uid() IS NOT NULL;
$function$;