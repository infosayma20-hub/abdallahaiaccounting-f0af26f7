
CREATE OR REPLACE FUNCTION public.feedback_followup_queue_debug(
  p_from_date date,
  p_to_date date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_uid uuid;
  v_can boolean;
  v_from timestamptz;
  v_to timestamptz;
  v_raw int := 0;
  v_no_phone int := 0;
  v_bad_norm int := 0;
  v_distinct int := 0;
  v_min_30 timestamptz;
  v_max_30 timestamptz;
  v_owner_total_30 int := 0;
BEGIN
  v_uid := auth.uid();
  v_owner := public.get_team_owner_id(v_uid);
  v_can := coalesce(public.has_feature_permission(v_uid,'call_center_feedback','customers','view'), false);

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object(
      'user_id', v_uid, 'owner_id', NULL, 'can_view', v_can,
      'error', 'AUTH_REQUIRED'
    );
  END IF;

  v_from := p_from_date::timestamptz;
  v_to := (p_to_date + 1)::timestamptz;

  SELECT count(*) INTO v_raw FROM call_center_orders o
   WHERE o.user_id = v_owner AND o.created_at >= v_from AND o.created_at < v_to;

  SELECT count(*) INTO v_no_phone FROM call_center_orders o
   WHERE o.user_id = v_owner AND o.created_at >= v_from AND o.created_at < v_to
     AND (o.customer_phone IS NULL OR o.customer_phone = '');

  SELECT count(*) INTO v_bad_norm FROM call_center_orders o
   WHERE o.user_id = v_owner AND o.created_at >= v_from AND o.created_at < v_to
     AND o.customer_phone IS NOT NULL AND o.customer_phone <> ''
     AND public.normalize_phone(o.customer_phone) IS NULL;

  SELECT count(DISTINCT public.normalize_phone(o.customer_phone)) INTO v_distinct
    FROM call_center_orders o
   WHERE o.user_id = v_owner AND o.created_at >= v_from AND o.created_at < v_to
     AND o.customer_phone IS NOT NULL
     AND public.normalize_phone(o.customer_phone) IS NOT NULL;

  SELECT min(created_at), max(created_at), count(*) INTO v_min_30, v_max_30, v_owner_total_30
    FROM call_center_orders o
   WHERE o.user_id = v_owner AND o.created_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'owner_id', v_owner,
    'can_view', v_can,
    'from', v_from,
    'to', v_to,
    'raw_orders_in_range', v_raw,
    'orders_missing_phone', v_no_phone,
    'orders_bad_phone_normalize', v_bad_norm,
    'distinct_customers_in_range', v_distinct,
    'owner_orders_last_30_days', v_owner_total_30,
    'owner_min_order_at_30d', v_min_30,
    'owner_max_order_at_30d', v_max_30
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.feedback_followup_queue_debug(date,date) TO authenticated;
