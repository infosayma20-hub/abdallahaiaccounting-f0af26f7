CREATE OR REPLACE FUNCTION public.get_delivery_apps_report(p_from date, p_to date, p_branch uuid DEFAULT NULL::uuid)
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