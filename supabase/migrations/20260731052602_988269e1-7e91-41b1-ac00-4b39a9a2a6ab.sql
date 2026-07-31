CREATE OR REPLACE FUNCTION public.get_tenants_usage_overview(_days integer DEFAULT 30)
RETURNS TABLE(
  owner_id uuid,
  company_id uuid,
  company_name text,
  plan_key text,
  plan_name text,
  sub_status text,
  period_end timestamptz,
  max_users integer,
  max_branches integer,
  max_invoices_per_month integer,
  users_count integer,
  branches_count integer,
  employees_count integer,
  contacts_count integer,
  pos_orders_count bigint,
  invoices_count bigint,
  transactions_count bigint,
  last_activity timestamptz,
  alert_level text,
  alert_reasons text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _since timestamptz := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT c.owner_id AS o_id, c.id AS c_id, c.name AS c_name
    FROM public.companies c
    WHERE COALESCE(c.is_active, true) = true
      AND c.owner_id IS NOT NULL
  ),
  sub AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id, s.status, s.current_period_end, s.plan_key, s.plan_id
    FROM public.subscriptions s
    ORDER BY s.user_id, s.created_at DESC
  ),
  pos_agg AS (
    SELECT po.user_id, count(*) AS cnt, max(po.created_at) AS last_at
    FROM public.pos_orders po
    WHERE po.created_at >= _since
    GROUP BY po.user_id
  ),
  inv_agg AS (
    SELECT i.user_id, count(*) AS cnt, max(i.created_at) AS last_at
    FROM public.invoices i
    WHERE i.created_at >= _since
    GROUP BY i.user_id
  ),
  trx_agg AS (
    SELECT t.user_id, count(*) AS cnt, max(t.created_at) AS last_at
    FROM public.transactions t
    WHERE t.created_at >= _since
    GROUP BY t.user_id
  ),
  emp_agg AS (
    SELECT e.user_id, count(*) FILTER (WHERE COALESCE(e.is_active, true)) AS cnt
    FROM public.employees e
    GROUP BY e.user_id
  ),
  con_agg AS (
    SELECT ct.user_id, count(*) AS cnt
    FROM public.contacts ct
    WHERE COALESCE(ct.is_archived, false) = false
    GROUP BY ct.user_id
  ),
  br_agg AS (
    SELECT b.user_id, count(*) AS cnt
    FROM public.branches b
    GROUP BY b.user_id
  ),
  usr_agg AS (
    SELECT ur.user_id, count(DISTINCT ur.user_id) AS cnt
    FROM public.user_roles ur
    GROUP BY ur.user_id
  )
  SELECT
    b.o_id,
    b.c_id,
    b.c_name,
    COALESCE(sub.plan_key, p.plan_key)::text,
    COALESCE(p.name_ar, p.name)::text,
    sub.status::text,
    sub.current_period_end,
    p.max_users,
    p.max_branches,
    p.max_invoices_per_month,
    COALESCE(usr_agg.cnt, 0)::integer,
    COALESCE(br_agg.cnt, 0)::integer,
    COALESCE(emp_agg.cnt, 0)::integer,
    COALESCE(con_agg.cnt, 0)::integer,
    COALESCE(pos_agg.cnt, 0)::bigint,
    COALESCE(inv_agg.cnt, 0)::bigint,
    COALESCE(trx_agg.cnt, 0)::bigint,
    GREATEST(
      COALESCE(pos_agg.last_at, 'epoch'::timestamptz),
      COALESCE(inv_agg.last_at, 'epoch'::timestamptz),
      COALESCE(trx_agg.last_at, 'epoch'::timestamptz)
    ) AS last_activity,
    CASE
      WHEN (p.max_branches IS NOT NULL AND COALESCE(br_agg.cnt, 0) > p.max_branches)
        OR (p.max_invoices_per_month IS NOT NULL AND p.max_invoices_per_month > 0
            AND COALESCE(inv_agg.cnt, 0) > p.max_invoices_per_month)
        OR (sub.current_period_end IS NOT NULL AND sub.current_period_end < now())
        THEN 'critical'
      WHEN (p.max_invoices_per_month IS NOT NULL AND p.max_invoices_per_month > 0
            AND COALESCE(inv_agg.cnt, 0) >= (p.max_invoices_per_month * 0.8))
        OR (sub.current_period_end IS NOT NULL
            AND sub.current_period_end < now() + interval '14 days')
        OR (COALESCE(pos_agg.cnt, 0) + COALESCE(inv_agg.cnt, 0) + COALESCE(trx_agg.cnt, 0)) > 20000
        THEN 'warning'
      ELSE 'ok'
    END::text AS alert_level,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN p.max_branches IS NOT NULL AND COALESCE(br_agg.cnt, 0) > p.max_branches
        THEN 'تجاوز عدد الفروع المسموح (' || COALESCE(br_agg.cnt, 0) || '/' || p.max_branches || ')' END,
      CASE WHEN p.max_invoices_per_month IS NOT NULL AND p.max_invoices_per_month > 0
            AND COALESCE(inv_agg.cnt, 0) > p.max_invoices_per_month
        THEN 'تجاوز حد الفواتير الشهري (' || COALESCE(inv_agg.cnt, 0) || '/' || p.max_invoices_per_month || ')' END,
      CASE WHEN p.max_invoices_per_month IS NOT NULL AND p.max_invoices_per_month > 0
            AND COALESCE(inv_agg.cnt, 0) BETWEEN CEIL(p.max_invoices_per_month * 0.8) AND p.max_invoices_per_month
        THEN 'اقترب من حد الفواتير الشهري' END,
      CASE WHEN sub.current_period_end IS NOT NULL AND sub.current_period_end < now()
        THEN 'الاشتراك منتهي' END,
      CASE WHEN sub.current_period_end IS NOT NULL AND sub.current_period_end >= now()
            AND sub.current_period_end < now() + interval '14 days'
        THEN 'الاشتراك ينتهي خلال أقل من ١٤ يوم' END,
      CASE WHEN (COALESCE(pos_agg.cnt, 0) + COALESCE(inv_agg.cnt, 0) + COALESCE(trx_agg.cnt, 0)) > 20000
        THEN 'حمل تشغيلي مرتفع — يُنصح بمراجعة الباقة/الموارد' END,
      CASE WHEN (COALESCE(pos_agg.cnt, 0) + COALESCE(inv_agg.cnt, 0) + COALESCE(trx_agg.cnt, 0)) = 0
        THEN 'لا يوجد نشاط خلال الفترة' END
    ], NULL) AS alert_reasons
  FROM base b
  LEFT JOIN sub ON sub.user_id = b.o_id
  LEFT JOIN public.plans p ON p.id = sub.plan_id OR p.plan_key = sub.plan_key
  LEFT JOIN pos_agg ON pos_agg.user_id = b.o_id
  LEFT JOIN inv_agg ON inv_agg.user_id = b.o_id
  LEFT JOIN trx_agg ON trx_agg.user_id = b.o_id
  LEFT JOIN emp_agg ON emp_agg.user_id = b.o_id
  LEFT JOIN con_agg ON con_agg.user_id = b.o_id
  LEFT JOIN br_agg ON br_agg.user_id = b.o_id
  LEFT JOIN usr_agg ON usr_agg.user_id = b.o_id
  ORDER BY (COALESCE(pos_agg.cnt, 0) + COALESCE(inv_agg.cnt, 0) + COALESCE(trx_agg.cnt, 0)) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_tenants_usage_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenants_usage_overview(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenants_usage_overview(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_platform_health_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'db_size_pretty', pg_size_pretty(pg_database_size(current_database())),
    'generated_at', now(),
    'top_tables_by_size', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT c.relname AS table_name,
               pg_total_relation_size(c.oid) AS total_bytes,
               pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
               COALESCE(s.n_live_tup, 0) AS live_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 15
      ) t
    ),
    'top_tables_by_writes', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT s.relname AS table_name,
               (s.n_tup_ins + s.n_tup_upd + s.n_tup_del) AS writes,
               s.n_tup_ins AS inserts,
               s.n_tup_upd AS updates,
               s.n_tup_del AS deletes,
               COALESCE(s.n_live_tup, 0) AS live_rows
        FROM pg_stat_user_tables s
        JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = s.relid)
        WHERE n.nspname = 'public'
        ORDER BY (s.n_tup_ins + s.n_tup_upd + s.n_tup_del) DESC
        LIMIT 15
      ) t
    ),
    'realtime_tables', (
      SELECT COALESCE(jsonb_agg(pt.tablename ORDER BY pt.tablename), '[]'::jsonb)
      FROM pg_publication_tables pt
      WHERE pt.pubname = 'supabase_realtime' AND pt.schemaname = 'public'
    )
  ) INTO _result;

  RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_platform_health_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_health_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_health_overview() TO service_role;