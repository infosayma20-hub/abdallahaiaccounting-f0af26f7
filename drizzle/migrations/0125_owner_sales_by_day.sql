CREATE OR REPLACE FUNCTION public.get_owner_sales_by_day(p_user_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH paid_orders AS (
  SELECT COALESCE(o.business_date, (o.created_at AT TIME ZONE 'Asia/Hebron')::date) AS d,
    GREATEST(0, COALESCE(o.total,0)::numeric - CASE WHEN COALESCE(o.total_includes_delivery_fee,false) THEN COALESCE(o.delivery_fee,0)::numeric ELSE 0 END) AS net_total
  FROM public.pos_orders o
  LEFT JOIN public.transactions tx ON tx.id = o.transaction_id
  WHERE o.user_id = p_user_id AND o.state = 'paid'
    AND (o.business_date BETWEEN p_from AND p_to
      OR (p_from < (CURRENT_DATE - 60) AND o.business_date IS NULL
          AND o.created_at >= ((p_from::text || ' 00:00:00+03')::timestamptz)
          AND o.created_at <= ((p_to::text || ' 23:59:59.999+03')::timestamptz)))
    AND (o.transaction_id IS NULL OR COALESCE(tx.is_deleted,false) = false)
), inv AS (
  SELECT i.invoice_date AS d, COALESCE(i.total_amount,0)::numeric AS amt
  FROM public.invoices i
  WHERE i.user_id = p_user_id AND i.invoice_type = 'sale' AND COALESCE(i.is_voided,false) = false
    AND i.status <> ALL (ARRAY['cancelled','void','reversed']) AND i.invoice_date BETWEEN p_from AND p_to
), x AS (
  SELECT d, net_total AS pos, 0::numeric AS invt, 1 AS cnt FROM paid_orders
  UNION ALL SELECT d, 0, amt, 1 FROM inv
)
SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'posTotal', pos, 'invTotal', invt, 'total', pos+invt, 'orderCount', cnt) ORDER BY d), '[]'::jsonb)
FROM (SELECT d, SUM(pos) pos, SUM(invt) invt, SUM(cnt)::int cnt FROM x GROUP BY d) g;
$$;
REVOKE ALL ON FUNCTION public.get_owner_sales_by_day(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_owner_sales_by_day(uuid, date, date) TO service_role;