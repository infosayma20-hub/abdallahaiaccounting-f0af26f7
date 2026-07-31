CREATE OR REPLACE FUNCTION public.kds_get_active_orders(_token text)
 RETURNS TABLE(order_id uuid, display_number text, order_number text, status text, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _local  timestamp := (now() AT TIME ZONE 'Asia/Hebron');
  _today_start timestamptz;
  _hide_secs integer := 0;
BEGIN
  -- business day starts at 06:00 local time
  _today_start := ((date_trunc('day', _local)
                    - CASE WHEN _local::time < time '06:00' THEN interval '1 day' ELSE interval '0' END
                    + interval '6 hours') AT TIME ZONE 'Asia/Hebron');

  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.pos_display_devices SET last_seen_at = now() WHERE id = _device.id;

  SELECT COALESCE(pos_ready_auto_hide_seconds, 0) INTO _hide_secs
  FROM public.company_settings WHERE user_id = _device.company_id LIMIT 1;

  RETURN QUERY
  WITH agg AS (
    SELECT kt.order_id,
           COALESCE(NULLIF(po.daily_display_number::text,''), po.order_number) AS display_number,
           po.order_number,
           MIN(kt.status) AS status,
           MAX(COALESCE(kt.ready_at, CASE WHEN kt.status='ready' THEN kt.updated_at END)) AS ready_at,
           MAX(kt.last_called_at) AS last_called_at,
           COALESCE(MAX(kt.call_count), 0)::int AS call_count,
           MIN(kt.created_at) AS created_at
    FROM public.kitchen_tickets kt
    JOIN public.pos_orders po ON po.id = kt.order_id
    WHERE kt.user_id = _device.company_id
      AND (_device.branch_id IS NULL
           OR COALESCE(kt.branch_id, public.pos_order_branch_id(kt.order_id)) = _device.branch_id)
      AND kt.status IN ('pending','preparing','ready')
      AND kt.created_at >= _today_start
    GROUP BY kt.order_id, po.daily_display_number, po.order_number
  )
  SELECT a.order_id, a.display_number, a.order_number, a.status,
         a.ready_at, a.last_called_at, a.call_count, a.created_at
  FROM agg a
  WHERE a.status <> 'ready'
     OR _hide_secs = 0
     OR a.ready_at IS NULL
     OR now() < a.ready_at + make_interval(secs => _hide_secs)
  ORDER BY a.created_at ASC;
END;
$function$;