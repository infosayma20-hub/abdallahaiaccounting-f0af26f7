CREATE OR REPLACE FUNCTION public.get_pos_sales_by_type(p_owner uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(order_type text, state text, branch_id uuid, orders bigint, gross numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(o.order_type, 'dine_in')::text,
         o.state::text,
         o.branch_id,
         COUNT(*)::bigint,
         COALESCE(SUM(o.total), 0)::numeric
  FROM public.pos_orders o
  WHERE o.user_id = p_owner
    AND o.state IN ('paid','cancelled')
    AND COALESCE(o.is_return, false) = false
    AND o.created_at >= p_from
    AND o.created_at <= p_to
  GROUP BY 1,2,3
$$;

GRANT EXECUTE ON FUNCTION public.get_pos_sales_by_type(uuid, timestamptz, timestamptz) TO authenticated;