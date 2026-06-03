CREATE OR REPLACE FUNCTION public.feedback_followup_queue(
  p_from_date date,
  p_to_date date,
  p_limit int DEFAULT 100
)
RETURNS TABLE(
  customer_id uuid,
  full_name text,
  display_phone text,
  normalized_phone text,
  branch_id uuid,
  branch_name text,
  last_order_at timestamptz,
  orders_count bigint,
  total_spent numeric,
  do_not_call boolean,
  last_call_at timestamptz,
  last_call_outcome text,
  last_sentiment text,
  last_rating int,
  last_note text,
  needs_followup_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_from timestamptz;
  v_to timestamptz;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','customers','view') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF p_to_date < p_from_date THEN RAISE EXCEPTION 'INVALID_DATE_RANGE'; END IF;
  IF (p_to_date - p_from_date) > 6 THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;

  v_from := p_from_date::timestamptz;
  v_to := (p_to_date + 1)::timestamptz;

  RETURN QUERY
  WITH agg AS (
    SELECT
      public.normalize_phone(o.customer_phone) AS norm_phone,
      max(o.customer_phone) AS disp_phone,
      max(o.customer_name) AS cust_name,
      (array_agg(o.target_branch_id ORDER BY o.created_at DESC))[1] AS branch_id_v,
      (array_agg(o.target_branch_name ORDER BY o.created_at DESC))[1] AS branch_name_v,
      max(o.created_at) AS last_order_at_v,
      count(*) AS orders_count_v,
      coalesce(sum(o.total),0) AS total_spent_v
    FROM public.call_center_orders o
    WHERE o.user_id = v_owner
      AND o.customer_phone IS NOT NULL
      AND public.normalize_phone(o.customer_phone) IS NOT NULL
      AND o.created_at >= v_from
      AND o.created_at <  v_to
    GROUP BY public.normalize_phone(o.customer_phone)
  ),
  last_calls AS (
    SELECT DISTINCT ON (fc.customer_id)
      fc.customer_id AS cust_id,
      fc.called_at, fc.outcome, fc.sentiment, fc.rating, fc.note, fc.followup_due_at
    FROM public.feedback_calls fc
    WHERE fc.user_id = v_owner
    ORDER BY fc.customer_id, fc.called_at DESC NULLS LAST
  )
  SELECT
    c.id,
    coalesce(c.full_name, a.cust_name),
    coalesce(c.display_phone, a.disp_phone),
    a.norm_phone,
    coalesce(c.last_known_branch_id, a.branch_id_v),
    a.branch_name_v,
    a.last_order_at_v,
    a.orders_count_v,
    a.total_spent_v,
    coalesce(c.do_not_call, false),
    lc.called_at, lc.outcome, lc.sentiment, lc.rating, lc.note, lc.followup_due_at
  FROM agg a
  LEFT JOIN public.feedback_customers c
    ON c.user_id = v_owner AND c.normalized_phone = a.norm_phone
  LEFT JOIN last_calls lc ON lc.cust_id = c.id
  ORDER BY a.last_order_at_v DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit,100), 500));
END;
$$;