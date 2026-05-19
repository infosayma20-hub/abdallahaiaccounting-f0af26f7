CREATE OR REPLACE FUNCTION public.kds_get_active_orders(_token text)
RETURNS TABLE(order_id uuid, display_number text, order_number text, status text, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _today_start timestamptz := date_trunc('day', now());
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.pos_display_devices SET last_seen_at = now() WHERE id = _device.id;

  RETURN QUERY
  SELECT kt.order_id,
         COALESCE(NULLIF(po.daily_display_number::text,''), po.order_number) AS display_number,
         po.order_number,
         MIN(kt.status) AS status,
         MAX(kt.ready_at) AS ready_at,
         MAX(kt.last_called_at) AS last_called_at,
         COALESCE(MAX(kt.call_count), 0) AS call_count,
         MIN(kt.created_at) AS created_at
  FROM public.kitchen_tickets kt
  JOIN public.pos_orders po ON po.id = kt.order_id
  WHERE kt.user_id = _device.company_id
    AND (_device.branch_id IS NULL OR kt.branch_id IS NULL OR kt.branch_id = _device.branch_id)
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  GROUP BY kt.order_id, po.daily_display_number, po.order_number
  ORDER BY MIN(kt.created_at) ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kds_get_active_tickets(_token text)
RETURNS TABLE(id uuid, display_number text, order_number text, status text, station_id uuid, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
         COALESCE(NULLIF(po.daily_display_number::text,''), po.order_number) AS display_number,
         po.order_number,
         kt.status,
         kt.station_id,
         kt.ready_at,
         kt.last_called_at,
         kt.call_count,
         kt.created_at
  FROM public.kitchen_tickets kt
  JOIN public.pos_orders po ON po.id = kt.order_id
  WHERE kt.user_id = _device.company_id
    AND (_device.branch_id IS NULL OR kt.branch_id IS NULL OR kt.branch_id = _device.branch_id)
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;