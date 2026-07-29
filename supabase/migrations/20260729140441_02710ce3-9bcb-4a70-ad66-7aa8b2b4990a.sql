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
  SELECT o.session_id,
         COALESCE(SUM(l.cost_price * l.qty), 0)::numeric
  FROM public.pos_orders o
  JOIN public.pos_order_lines l ON l.order_id = o.id
  WHERE o.user_id = _owner
    AND o.state = 'paid'
    AND o.is_return = false
    AND (
      (o.business_date IS NOT NULL AND o.business_date BETWEEN _from AND _to)
      OR (o.business_date IS NULL AND o.created_at >= _from_ts AND o.created_at <= _to_ts)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.is_deleted = true
        AND t.id IN (o.transaction_id, o.linked_transaction_id)
    )
  GROUP BY o.session_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_pos_cogs_by_session(uuid, date, date, timestamptz, timestamptz) TO authenticated;