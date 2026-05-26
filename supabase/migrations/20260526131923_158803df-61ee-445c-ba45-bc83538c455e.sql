
-- 1) Lock writes on feedback_customers: only RPCs may write.
DROP POLICY IF EXISTS "fb_customers_insert" ON public.feedback_customers;
DROP POLICY IF EXISTS "fb_customers_update" ON public.feedback_customers;
REVOKE INSERT, UPDATE, DELETE ON public.feedback_customers FROM authenticated, anon;

-- (SELECT policy + fb_calls_select + fb_calls_insert remain — calls insert still RLS-gated;
--  we can additionally REVOKE INSERT on calls if we want full RPC-only writes.)
-- For symmetry now lock calls writes too:
DROP POLICY IF EXISTS "fb_calls_insert" ON public.feedback_calls;
REVOKE INSERT ON public.feedback_calls FROM authenticated, anon;

-- 2) Read-only RPC: search customers by phone (normalized) or name (trgm)
CREATE OR REPLACE FUNCTION public.feedback_search_customers(p_query text, p_limit int DEFAULT 30)
RETURNS TABLE (
  id uuid,
  display_phone text,
  normalized_phone text,
  full_name text,
  last_known_branch_id uuid,
  total_orders_cached int,
  last_order_at_cached timestamptz,
  do_not_call boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_q text;
  v_phone text;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;
  IF NOT public.has_feature_permission(auth.uid(), 'call_center_feedback','customers','view') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_q := trim(coalesce(p_query, ''));
  IF v_q = '' THEN RETURN; END IF;

  v_phone := public.normalize_phone(v_q);

  RETURN QUERY
  SELECT c.id, c.display_phone, c.normalized_phone, c.full_name,
         c.last_known_branch_id, c.total_orders_cached, c.last_order_at_cached, c.do_not_call
  FROM public.feedback_customers c
  WHERE c.user_id = v_owner
    AND (
      (v_phone IS NOT NULL AND c.normalized_phone LIKE v_phone || '%')
      OR (lower(coalesce(c.full_name,'')) LIKE '%' || lower(v_q) || '%')
    )
  ORDER BY c.last_order_at_cached DESC NULLS LAST, c.updated_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 30), 100));
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_search_customers(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_search_customers(text, int) TO authenticated;

-- 3) Read-only RPC: customer orders summary (call_center_orders only for MVP; no accounting data)
CREATE OR REPLACE FUNCTION public.feedback_get_customer_orders(p_customer_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  source text,
  order_id uuid,
  created_at timestamptz,
  branch_id uuid,
  total numeric,
  status text,
  items_summary text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT 'call_center'::text AS source,
         o.id AS order_id,
         o.created_at,
         o.target_branch_id AS branch_id,
         o.total,
         o.status,
         CASE
           WHEN o.items IS NULL THEN NULL
           WHEN jsonb_typeof(o.items) = 'array' THEN
             (SELECT string_agg(coalesce(it->>'name', it->>'product_name', ''), ' • ')
              FROM jsonb_array_elements(o.items) it)
           ELSE NULL
         END AS items_summary
  FROM public.call_center_orders o
  WHERE o.user_id = v_owner
    AND public.normalize_phone(o.customer_phone) = v_phone
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 50), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_get_customer_orders(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_get_customer_orders(uuid, int) TO authenticated;
