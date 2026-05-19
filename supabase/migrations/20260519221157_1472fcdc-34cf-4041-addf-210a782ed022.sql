-- Fix KDS display lookup: pos_display_devices.company_id == owner auth user id (per RLS),
-- while kitchen_tickets.user_id == owner auth user id. Join by user_id.

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
         COALESCE(kt.display_number, po.display_number, po.order_number) AS display_number,
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
  GROUP BY kt.order_id, kt.display_number, po.display_number, po.order_number
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
  WHERE kt.user_id = _device.company_id
    AND (_device.branch_id IS NULL OR kt.branch_id IS NULL OR kt.branch_id = _device.branch_id)
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;

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
  WHERE kt.user_id = _device.company_id
    AND (_device.branch_id IS NULL OR kt.branch_id IS NULL OR kt.branch_id = _device.branch_id)
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;