
-- 1) Add driver_rating + driver_name to feedback_calls
ALTER TABLE public.feedback_calls
  ADD COLUMN IF NOT EXISTS driver_rating integer,
  ADD COLUMN IF NOT EXISTS driver_name text;

-- Validation trigger for driver_rating bounds
CREATE OR REPLACE FUNCTION public.feedback_calls_validate_driver_rating()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_rating IS NOT NULL AND (NEW.driver_rating < 1 OR NEW.driver_rating > 5) THEN
    RAISE EXCEPTION 'INVALID_DRIVER_RATING';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feedback_calls_validate_driver_rating ON public.feedback_calls;
CREATE TRIGGER trg_feedback_calls_validate_driver_rating
BEFORE INSERT OR UPDATE ON public.feedback_calls
FOR EACH ROW EXECUTE FUNCTION public.feedback_calls_validate_driver_rating();

-- 2) Update feedback_log_call to accept driver_rating + driver_name
DROP FUNCTION IF EXISTS public.feedback_log_call(uuid,text,text,integer,text,text,text,boolean,timestamptz,uuid);

CREATE OR REPLACE FUNCTION public.feedback_log_call(
  p_customer_id uuid,
  p_outcome text,
  p_sentiment text DEFAULT NULL,
  p_rating integer DEFAULT NULL,
  p_complaint_text text DEFAULT NULL,
  p_suggestion_text text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_needs_followup boolean DEFAULT false,
  p_followup_due_at timestamptz DEFAULT NULL,
  p_related_order_id uuid DEFAULT NULL,
  p_driver_rating integer DEFAULT NULL,
  p_driver_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid; v_cust public.feedback_customers%ROWTYPE;
  v_order_phone_norm text; v_name text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','calls','create') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_owner := public.get_team_owner_id(auth.uid());

  SELECT * INTO v_cust FROM public.feedback_customers
   WHERE id = p_customer_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF v_cust.do_not_call THEN RAISE EXCEPTION 'DO_NOT_CALL_ACTIVE'; END IF;

  IF p_outcome NOT IN ('answered','no_answer','busy','wrong_number','callback_requested','refused') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME';
  END IF;
  IF p_sentiment IS NOT NULL
     AND p_sentiment NOT IN ('satisfied','unsatisfied','complaint','suggestion','neutral') THEN
    RAISE EXCEPTION 'INVALID_SENTIMENT';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'INVALID_RATING';
  END IF;
  IF p_driver_rating IS NOT NULL AND (p_driver_rating < 1 OR p_driver_rating > 5) THEN
    RAISE EXCEPTION 'INVALID_DRIVER_RATING';
  END IF;
  IF p_needs_followup AND p_followup_due_at IS NULL THEN
    RAISE EXCEPTION 'FOLLOWUP_DUE_REQUIRED';
  END IF;

  IF p_related_order_id IS NOT NULL THEN
    SELECT public.normalize_phone(customer_phone) INTO v_order_phone_norm
      FROM public.call_center_orders
     WHERE id = p_related_order_id AND user_id = v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
    IF v_order_phone_norm IS DISTINCT FROM v_cust.normalized_phone THEN
      RAISE EXCEPTION 'ORDER_CUSTOMER_MISMATCH';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.feedback_calls
     WHERE customer_id = p_customer_id
       AND called_by = auth.uid()
       AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;

  SELECT COALESCE(full_name, display_name) INTO v_name
    FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.feedback_calls (
    user_id, customer_id, related_order_id, outcome, sentiment, rating,
    complaint_text, suggestion_text, note, needs_followup, followup_due_at,
    called_by, called_by_name, driver_rating, driver_name
  ) VALUES (
    v_owner, p_customer_id, p_related_order_id, p_outcome, p_sentiment, p_rating,
    nullif(trim(p_complaint_text),''), nullif(trim(p_suggestion_text),''), nullif(trim(p_note),''),
    COALESCE(p_needs_followup,false), p_followup_due_at,
    auth.uid(), v_name,
    p_driver_rating,
    nullif(trim(p_driver_name),'')
  ) RETURNING id INTO v_id;

  RETURN v_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.feedback_log_call(uuid,text,text,integer,text,text,text,boolean,timestamptz,uuid,integer,text) TO authenticated;

-- 3) Extend feedback_get_customer_orders to include billing breakdown + items detail
DROP FUNCTION IF EXISTS public.feedback_get_customer_orders(uuid,integer);

CREATE OR REPLACE FUNCTION public.feedback_get_customer_orders(
  p_customer_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  source text,
  order_id uuid,
  created_at timestamptz,
  branch_id uuid,
  total numeric,
  delivery_fee numeric,
  order_value numeric,
  status text,
  delivery_type text,
  payment_method text,
  delivery_address text,
  order_note text,
  items jsonb,
  items_summary text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_phone text;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;
  IF NOT public.has_feature_permission(auth.uid(), 'call_center_feedback','customers','view') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT c.normalized_phone INTO v_phone
  FROM public.feedback_customers c
  WHERE c.id = p_customer_id AND c.user_id = v_owner;

  IF v_phone IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    'call_center'::text AS source,
    o.id AS order_id,
    o.created_at,
    o.target_branch_id AS branch_id,
    o.total,
    COALESCE(o.delivery_fee, 0) AS delivery_fee,
    GREATEST(COALESCE(o.total,0) - COALESCE(o.delivery_fee,0), 0) AS order_value,
    o.status,
    o.delivery_type,
    o.payment_method,
    o.delivery_address,
    o.order_note,
    o.items,
    CASE
      WHEN o.items IS NULL THEN NULL
      WHEN jsonb_typeof(o.items) = 'array' THEN
        (SELECT string_agg(
                  coalesce(nullif(trim(it->>'name'),''), it->>'product_name', 'صنف')
                  || ' ×' || coalesce(it->>'qty', it->>'quantity', '1'),
                  '، ')
         FROM jsonb_array_elements(o.items) it)
      ELSE NULL
    END AS items_summary
  FROM public.call_center_orders o
  WHERE o.user_id = v_owner
    AND public.normalize_phone(o.customer_phone) = v_phone
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.feedback_get_customer_orders(uuid,integer) TO authenticated;

-- 4) Update feedback_followup_queue to include lifetime visits + billing breakdown + last driver rating
DROP FUNCTION IF EXISTS public.feedback_followup_queue(date,date,integer,text,uuid,text,boolean,text,integer,integer,integer);

CREATE OR REPLACE FUNCTION public.feedback_followup_queue(
  p_from_date date,
  p_to_date   date,
  p_limit     integer DEFAULT 100,
  p_query     text    DEFAULT NULL,
  p_branch_id uuid    DEFAULT NULL,
  p_status    text    DEFAULT NULL,
  p_dnc       boolean DEFAULT NULL,
  p_sentiment text    DEFAULT NULL,
  p_min_rating integer DEFAULT NULL,
  p_max_rating integer DEFAULT NULL,
  p_offset    integer DEFAULT 0
)
RETURNS TABLE(
  customer_id uuid,
  full_name text,
  display_phone text,
  normalized_phone text,
  branch_id uuid,
  branch_name text,
  last_order_id uuid,
  last_order_number text,
  last_order_at timestamptz,
  orders_count bigint,
  lifetime_visits bigint,
  total_spent numeric,
  last_order_total numeric,
  last_delivery_fee numeric,
  last_order_value numeric,
  do_not_call boolean,
  last_call_at timestamptz,
  last_call_outcome text,
  last_sentiment text,
  last_rating integer,
  last_driver_rating integer,
  last_driver_name text,
  last_note text,
  last_handled_by text,
  followup_status text,
  needs_followup_at timestamptz,
  source text,
  order_taken_by_user_id uuid,
  order_taken_by_name text,
  last_order_items_summary text,
  last_order_items jsonb,
  last_order_note text,
  last_order_type text,
  last_payment_method text,
  last_address text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_q text;
  v_q_norm text;
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
  v_q := nullif(trim(coalesce(p_query,'')), '');
  v_q_norm := public.normalize_phone(coalesce(v_q,''));

  RETURN QUERY
  WITH agg AS (
    SELECT
      public.normalize_phone(o.customer_phone) AS norm_phone,
      max(o.customer_phone) AS disp_phone,
      max(o.customer_name) AS cust_name,
      (array_agg(o.target_branch_id   ORDER BY o.created_at DESC))[1] AS branch_id_v,
      (array_agg(o.target_branch_name ORDER BY o.created_at DESC))[1] AS branch_name_v,
      (array_agg(o.id                 ORDER BY o.created_at DESC))[1] AS last_order_id_v,
      (array_agg(coalesce(o.dispatched_by, o.accepted_by) ORDER BY o.created_at DESC))[1] AS taken_by_uid_v,
      (array_agg(o.dispatched_by_name ORDER BY o.created_at DESC))[1] AS taken_by_name_v,
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
  lifetime AS (
    -- Lifetime visits across ALL time, independent of the date filter
    SELECT
      public.normalize_phone(o.customer_phone) AS norm_phone,
      count(*) AS lifetime_visits_v
    FROM public.call_center_orders o
    WHERE o.user_id = v_owner
      AND o.customer_phone IS NOT NULL
      AND public.normalize_phone(o.customer_phone) IS NOT NULL
    GROUP BY public.normalize_phone(o.customer_phone)
  ),
  last_orders AS (
    SELECT
      a.norm_phone,
      o.items            AS last_items_v,
      o.delivery_type    AS last_type_v,
      o.payment_method   AS last_pay_v,
      o.delivery_address AS last_addr_v,
      o.order_note       AS last_order_note_v,
      o.total            AS last_total_v,
      COALESCE(o.delivery_fee, 0) AS last_fee_v,
      GREATEST(COALESCE(o.total,0) - COALESCE(o.delivery_fee,0), 0) AS last_value_v,
      (
        SELECT string_agg(
                 coalesce(nullif(trim(it.elem->>'name'), ''), 'صنف') ||
                 ' ×' || coalesce(it.elem->>'qty','1'),
                 '، '
               )
        FROM (
          SELECT e AS elem
          FROM jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) e
          LIMIT 5
        ) it
      ) AS items_summary_v
    FROM agg a
    LEFT JOIN public.call_center_orders o ON o.id = a.last_order_id_v
  ),
  last_calls AS (
    SELECT DISTINCT ON (fc.customer_id)
      fc.customer_id AS cust_id,
      fc.called_at, fc.outcome, fc.sentiment, fc.rating, fc.note,
      fc.driver_rating, fc.driver_name,
      fc.followup_due_at,
      fc.called_by_name AS handled_by_v
    FROM public.feedback_calls fc
    WHERE fc.user_id = v_owner
    ORDER BY fc.customer_id, fc.called_at DESC NULLS LAST
  ),
  joined AS (
    SELECT
      c.id AS customer_id_v,
      coalesce(c.full_name, a.cust_name) AS full_name_v,
      coalesce(c.display_phone, a.disp_phone) AS display_phone_v,
      a.norm_phone,
      coalesce(c.last_known_branch_id, a.branch_id_v) AS branch_id_v,
      a.branch_name_v,
      a.last_order_id_v,
      a.last_order_at_v,
      a.orders_count_v,
      COALESCE(lf.lifetime_visits_v, a.orders_count_v) AS lifetime_visits_v,
      a.total_spent_v,
      a.taken_by_uid_v,
      a.taken_by_name_v,
      coalesce(c.do_not_call, false) AS do_not_call_v,
      lc.called_at AS last_call_at_v,
      lc.outcome   AS last_call_outcome_v,
      lc.sentiment AS last_sentiment_v,
      lc.rating    AS last_rating_v,
      lc.driver_rating AS last_driver_rating_v,
      lc.driver_name   AS last_driver_name_v,
      lc.note      AS last_note_v,
      lc.handled_by_v,
      lc.followup_due_at AS needs_followup_at_v,
      lo.last_items_v,
      lo.last_type_v,
      lo.last_pay_v,
      lo.last_addr_v,
      lo.last_order_note_v,
      lo.items_summary_v,
      lo.last_total_v,
      lo.last_fee_v,
      lo.last_value_v,
      CASE
        WHEN coalesce(c.do_not_call,false) THEN 'dnc'
        WHEN lc.outcome IS NULL THEN 'not_called'
        WHEN lc.followup_due_at IS NOT NULL AND lc.followup_due_at >= now() THEN 'needs_followup'
        WHEN lc.sentiment = 'complaint' THEN 'complaint'
        WHEN lc.outcome IN ('no_answer','busy') THEN 'no_answer'
        WHEN lc.outcome = 'callback_requested' THEN 'needs_followup'
        WHEN lc.outcome IN ('answered','refused','wrong_number') THEN 'called'
        ELSE 'called'
      END AS followup_status_v
    FROM agg a
    LEFT JOIN last_orders lo ON lo.norm_phone = a.norm_phone
    LEFT JOIN lifetime lf    ON lf.norm_phone = a.norm_phone
    LEFT JOIN public.feedback_customers c
      ON c.user_id = v_owner AND c.normalized_phone = a.norm_phone
    LEFT JOIN last_calls lc ON lc.cust_id = c.id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_q IS NULL
           OR j.full_name_v ILIKE '%' || v_q || '%'
           OR j.display_phone_v ILIKE '%' || v_q || '%'
           OR (v_q_norm <> '' AND j.norm_phone ILIKE '%' || v_q_norm || '%')
          )
      AND (p_branch_id IS NULL OR j.branch_id_v = p_branch_id)
      AND (p_status IS NULL OR j.followup_status_v = p_status)
      AND (p_dnc IS NULL OR j.do_not_call_v = p_dnc)
      AND (p_sentiment IS NULL OR j.last_sentiment_v = p_sentiment)
      AND (p_min_rating IS NULL OR j.last_rating_v >= p_min_rating)
      AND (p_max_rating IS NULL OR j.last_rating_v <= p_max_rating)
  ),
  counted AS (
    SELECT count(*)::bigint AS c FROM filtered
  )
  SELECT
    f.customer_id_v,
    f.full_name_v,
    f.display_phone_v,
    f.norm_phone,
    f.branch_id_v,
    f.branch_name_v,
    f.last_order_id_v,
    NULL::text AS last_order_number,
    f.last_order_at_v,
    f.orders_count_v,
    f.lifetime_visits_v,
    f.total_spent_v,
    f.last_total_v,
    f.last_fee_v,
    f.last_value_v,
    f.do_not_call_v,
    f.last_call_at_v,
    f.last_call_outcome_v,
    f.last_sentiment_v,
    f.last_rating_v,
    f.last_driver_rating_v,
    f.last_driver_name_v,
    f.last_note_v,
    f.handled_by_v,
    f.followup_status_v,
    f.needs_followup_at_v,
    'call_center'::text AS source,
    f.taken_by_uid_v,
    coalesce(nullif(trim(f.taken_by_name_v), ''), 'غير محدد') AS order_taken_by_name,
    f.items_summary_v   AS last_order_items_summary,
    f.last_items_v      AS last_order_items,
    f.last_order_note_v AS last_order_note,
    f.last_type_v       AS last_order_type,
    f.last_pay_v        AS last_payment_method,
    f.last_addr_v       AS last_address,
    (SELECT c FROM counted) AS total_count
  FROM filtered f
  ORDER BY f.last_order_at_v DESC
  OFFSET GREATEST(0, coalesce(p_offset, 0))
  LIMIT  GREATEST(1, LEAST(coalesce(p_limit,100), 500));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.feedback_followup_queue(date,date,integer,text,uuid,text,boolean,text,integer,integer,integer) TO authenticated;
