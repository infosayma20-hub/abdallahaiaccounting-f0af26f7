CREATE OR REPLACE FUNCTION public.get_pos_cogs_by_session(
  _owner uuid,
  _from date,
  _to date,
  _from_ts timestamptz,
  _to_ts timestamptz
)
RETURNS TABLE(session_id uuid, cogs numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH voided AS (
    SELECT t.id FROM public.transactions t
    WHERE t.user_id = _owner AND t.is_deleted = true
  ),
  scoped AS (
    SELECT o.id, o.session_id
    FROM public.pos_orders o
    WHERE o.user_id = _owner
      AND o.state = 'paid'
      AND o.is_return = false
      AND (
        (o.business_date IS NOT NULL AND o.business_date BETWEEN _from AND _to)
        OR (o.business_date IS NULL AND o.created_at >= _from_ts AND o.created_at <= _to_ts)
      )
      AND (o.transaction_id IS NULL OR o.transaction_id NOT IN (SELECT id FROM voided))
      AND (o.linked_transaction_id IS NULL OR o.linked_transaction_id NOT IN (SELECT id FROM voided))
  )
  SELECT s.session_id, COALESCE(SUM(l.cost_price * l.qty), 0)::numeric
  FROM scoped s
  JOIN public.pos_order_lines l ON l.order_id = s.id
  GROUP BY s.session_id;
$$;