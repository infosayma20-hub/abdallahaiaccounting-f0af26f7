CREATE OR REPLACE FUNCTION public.get_delivery_apps_report(
  p_from date,
  p_to date,
  p_branch uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_apps jsonb;
  v_daily jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  v_owner := public.get_team_owner_id(auth.uid());

  CREATE TEMP TABLE _dar_base ON COMMIT DROP AS
  WITH cc AS (
    SELECT DISTINCT ON (pos_order_id) pos_order_id, source_app
    FROM public.call_center_orders
    WHERE pos_order_id IS NOT NULL
    ORDER BY pos_order_id, created_at DESC
  ),
  ord AS (
    SELECT
      o.id,
      o.business_date,
      o.state,
      o.is_return,
      COALESCE(o.total, 0)::numeric AS total,
      COALESCE(o.delivery_fee, 0)::numeric AS delivery_fee,
      COALESCE(o.total_includes_delivery_fee, false) AS fee_in_total,
      COALESCE(
        NULLIF(btrim(cc.source_app), ''),
        public.pos_normalize_delivery_app(o.order_note),
        public.pos_normalize_delivery_app(o.notes)
      ) AS app
    FROM public.pos_orders o
    LEFT JOIN cc ON cc.pos_order_id = o.id
    LEFT JOIN public.transactions t ON t.id = o.transaction_id
    WHERE o.user_id = v_owner
      AND o.business_date BETWEEN p_from AND p_to
      AND (p_branch IS NULL OR o.branch_id = p_branch)
      AND COALESCE(t.is_deleted, false) = false
  )
  SELECT
    ord.id,
    ord.business_date,
    ord.state,
    ord.is_return,
    ord.delivery_fee,
    CASE WHEN ord.fee_in_total THEN GREATEST(0, ord.total - ord.delivery_fee) ELSE ord.total END AS net_sales,
    ord.total AS collected,
    ord.app
  FROM ord
  WHERE ord.app IS NOT NULL
    AND upper(ord.app) <> 'KIOSK';

  SELECT COALESCE(jsonb_agg(x ORDER BY x.net_sales DESC), '[]'::jsonb) INTO v_apps
  FROM (
    SELECT
      b.app,
      COUNT(*) FILTER (WHERE b.state = 'paid' AND NOT b.is_return)::int AS orders,
      COALESCE(SUM(b.net_sales) FILTER (WHERE b.state = 'paid' AND NOT b.is_return), 0)::numeric AS net_sales,
      COALESCE(SUM(b.delivery_fee) FILTER (WHERE b.state = 'paid' AND NOT b.is_return), 0)::numeric AS delivery_fees,
      COALESCE(SUM(b.collected) FILTER (WHERE b.state = 'paid' AND NOT b.is_return), 0)::numeric AS collected,
      COUNT(*) FILTER (WHERE b.state = 'cancelled')::int AS cancelled_orders,
      COALESCE(SUM(b.net_sales) FILTER (WHERE b.state = 'cancelled'), 0)::numeric AS cancelled_amount,
      COUNT(*) FILTER (WHERE b.is_return)::int AS returns_orders,
      COALESCE(SUM(b.net_sales) FILTER (WHERE b.is_return), 0)::numeric AS returns_amount,
      COALESCE((
        SELECT SUM(p.amount) FROM public.pos_payments p
        WHERE p.order_id = ANY(array_agg(b.id) FILTER (WHERE b.state = 'paid' AND NOT b.is_return))
          AND p.payment_method = 'cash'
      ), 0)::numeric AS cash_amount,
      COALESCE((
        SELECT SUM(p.amount) FROM public.pos_payments p
        WHERE p.order_id = ANY(array_agg(b.id) FILTER (WHERE b.state = 'paid' AND NOT b.is_return))
          AND p.payment_method = 'card'
      ), 0)::numeric AS card_amount,
      COALESCE((
        SELECT SUM(p.amount) FROM public.pos_payments p
        WHERE p.order_id = ANY(array_agg(b.id) FILTER (WHERE b.state = 'paid' AND NOT b.is_return))
          AND p.payment_method NOT IN ('cash', 'card')
      ), 0)::numeric AS other_amount
    FROM _dar_base b
    GROUP BY b.app
  ) x;

  SELECT COALESCE(jsonb_agg(d ORDER BY d.day, d.app), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT
      b.business_date AS day,
      b.app,
      COUNT(*) FILTER (WHERE b.state = 'paid' AND NOT b.is_return)::int AS orders,
      COALESCE(SUM(b.net_sales) FILTER (WHERE b.state = 'paid' AND NOT b.is_return), 0)::numeric AS net_sales
    FROM _dar_base b
    GROUP BY 1, 2
  ) d;

  DROP TABLE IF EXISTS _dar_base;

  RETURN jsonb_build_object('apps', v_apps, 'daily', v_daily, 'from', p_from, 'to', p_to);
END;
$$;