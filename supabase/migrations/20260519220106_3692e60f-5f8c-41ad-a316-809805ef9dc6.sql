-- 1) kds_get_active_orders — VOLATILE
CREATE OR REPLACE FUNCTION public.kds_get_active_orders(_token text)
 RETURNS TABLE(order_id uuid, display_number text, order_number text, status text, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _today_start TIMESTAMPTZ;
  _src TEXT;
  _hide_seconds INTEGER := 300;
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.pos_display_devices SET last_seen_at = now() WHERE id = _device.id;

  SELECT COALESCE(pos_kds_display_number_source,'short_daily_number'),
         COALESCE(pos_ready_auto_hide_seconds, 300)
    INTO _src, _hide_seconds
  FROM public.company_settings cs
  JOIN public.pos_companies pc ON pc.user_id = cs.user_id
  WHERE pc.id = _device.company_id
  LIMIT 1;

  _today_start := (public.kds_business_date(now())::timestamp) AT TIME ZONE 'Asia/Hebron';

  RETURN QUERY
  WITH t AS (
    SELECT kt.order_id, kt.status, kt.ready_at, kt.last_called_at,
           kt.call_count, kt.company_id, kt.branch_id, kt.created_at
    FROM public.kitchen_tickets kt
    WHERE kt.company_id = _device.company_id
      AND (_device.branch_id IS NULL OR kt.branch_id = _device.branch_id)
      AND kt.created_at >= _today_start
      AND kt.status IN ('pending','preparing','ready')
  ),
  agg AS (
    SELECT t.order_id,
           CASE
             WHEN COUNT(*) = COUNT(*) FILTER (WHERE t.status='ready') THEN 'ready'
             ELSE 'preparing'
           END AS agg_status,
           MAX(t.ready_at) AS ready_at,
           MAX(t.last_called_at) AS last_called_at,
           MAX(t.call_count) AS call_count,
           MIN(t.created_at) AS created_at
    FROM t
    GROUP BY t.order_id
  )
  SELECT a.order_id,
         CASE WHEN _src = 'order_number' THEN po.order_number
              ELSE COALESCE(NULLIF(po.daily_display_number::text,''), po.order_number)
         END AS display_number,
         po.order_number,
         a.agg_status,
         a.ready_at, a.last_called_at, a.call_count, a.created_at
  FROM agg a
  JOIN public.pos_orders po ON po.id = a.order_id
  WHERE
    NOT (a.agg_status = 'ready'
         AND a.ready_at IS NOT NULL
         AND a.ready_at < now() - make_interval(secs => _hide_seconds))
  ORDER BY a.created_at ASC;
END;
$function$;

-- 2) kds_get_active_tickets — VOLATILE
CREATE OR REPLACE FUNCTION public.kds_get_active_tickets(_token text)
 RETURNS TABLE(id uuid, display_number text, order_number text, status text, station_id uuid, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _today_start timestamptz := date_trunc('day', now());
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.pos_display_devices SET last_seen_at = now() WHERE id = _device.id;

  RETURN QUERY
  SELECT kt.id,
         COALESCE(kt.display_number, po.display_number, po.order_number) AS display_number,
         po.order_number,
         kt.status,
         kt.station_id,
         kt.ready_at,
         kt.last_called_at,
         kt.call_count,
         kt.created_at
  FROM public.kitchen_tickets kt
  JOIN public.pos_orders po ON po.id = kt.order_id
  WHERE kt.company_id = _device.company_id
    AND (_device.branch_id IS NULL OR po.session_id IN (
          SELECT s.id FROM public.pos_sessions s WHERE s.branch_id = _device.branch_id
        ))
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;

-- 3) kds_get_kitchen_tickets — VOLATILE + use_column to resolve ambiguous "id"
CREATE OR REPLACE FUNCTION public.kds_get_kitchen_tickets(_token text)
 RETURNS TABLE(id uuid, order_id uuid, station_id uuid, status text, items jsonb, created_at timestamp with time zone, ready_at timestamp with time zone, order_number text, daily_display_number integer, table_name text)
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _today_start TIMESTAMPTZ;
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF _device.device_type NOT IN ('kitchen_screen','heater_screen') THEN RETURN; END IF;

  UPDATE public.pos_display_devices SET last_seen_at = now() WHERE id = _device.id;

  _today_start := (public.kds_business_date(now())::timestamp) AT TIME ZONE 'Asia/Hebron';

  RETURN QUERY
  SELECT kt.id, kt.order_id, kt.station_id, kt.status, kt.items,
         kt.created_at, kt.ready_at,
         po.order_number, po.daily_display_number,
         rt.name AS table_name
  FROM public.kitchen_tickets kt
  JOIN public.pos_orders po ON po.id = kt.order_id
  LEFT JOIN public.restaurant_tables rt ON rt.id = po.table_id
  WHERE kt.company_id = _device.company_id
    AND (_device.branch_id IS NULL OR kt.branch_id = _device.branch_id)
    AND kt.created_at >= _today_start
    AND kt.status IN ('pending','preparing','ready')
  ORDER BY kt.created_at ASC;
END;
$function$;