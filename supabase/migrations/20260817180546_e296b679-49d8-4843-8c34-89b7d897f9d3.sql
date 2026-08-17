CREATE OR REPLACE FUNCTION public.get_pos_sales_by_type(p_owner uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(order_type text, state text, branch_id uuid, orders bigint, gross numeric)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_team_member(auth.uid(), p_owner) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
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
  GROUP BY 1,2,3;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pos_sales_by_type(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_sales_by_type(uuid, timestamptz, timestamptz) TO authenticated;