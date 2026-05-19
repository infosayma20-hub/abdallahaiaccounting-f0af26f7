
-- Helper: resolve a POS order's branch via session -> terminal
CREATE OR REPLACE FUNCTION public.pos_order_branch_id(_order_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.branch_id
  FROM public.pos_orders po
  LEFT JOIN public.pos_sessions s ON s.id = po.session_id
  LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE po.id = _order_id
  LIMIT 1
$$;

-- kds_get_active_orders: strict branch isolation when device has a branch
CREATE OR REPLACE FUNCTION public.kds_get_active_orders(_token text)
RETURNS TABLE(order_id uuid, display_number text, order_number text, status text, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _today_start timestamptz := date_trunc('day', now());
  _hide_secs integer := 0;
BEGIN
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

-- kds_get_active_tickets
CREATE OR REPLACE FUNCTION public.kds_get_active_tickets(_token text)
RETURNS TABLE(id uuid, display_number text, order_number text, status text, station_id uuid, ready_at timestamp with time zone, last_called_at timestamp with time zone, call_count integer, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
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
         kt.status, kt.station_id, kt.ready_at, kt.last_called_at, kt.call_count, kt.created_at
  FROM public.kitchen_tickets kt
  JOIN public.pos_orders po ON po.id = kt.order_id
  WHERE kt.user_id = _device.company_id
    AND (_device.branch_id IS NULL
         OR COALESCE(kt.branch_id, public.pos_order_branch_id(kt.order_id)) = _device.branch_id)
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;

-- kds_get_kitchen_tickets
CREATE OR REPLACE FUNCTION public.kds_get_kitchen_tickets(_token text)
RETURNS TABLE(id uuid, order_id uuid, station_id uuid, status text, items jsonb, created_at timestamp with time zone, ready_at timestamp with time zone, order_number text, daily_display_number integer, table_name text)
LANGUAGE plpgsql
SECURITY DEFINER
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
    AND (_device.branch_id IS NULL
         OR COALESCE(kt.branch_id, public.pos_order_branch_id(kt.order_id)) = _device.branch_id)
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;

-- kds_recent_call_events
CREATE OR REPLACE FUNCTION public.kds_recent_call_events(_token text, _since timestamp with time zone DEFAULT NULL)
RETURNS TABLE(id uuid, order_id uuid, display_number text, event_type text, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _d public.pos_display_devices%ROWTYPE;
BEGIN
  SELECT * INTO _d FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.order_id,
         COALESCE(NULLIF(po.daily_display_number::text,''), po.order_number, e.display_number) AS display_number,
         e.event_type, e.created_at
  FROM public.kds_call_events e
  LEFT JOIN public.kitchen_tickets kt ON kt.id = e.ticket_id
  LEFT JOIN public.pos_orders po ON po.id = e.order_id
  WHERE COALESCE(kt.user_id, po.user_id) = _d.company_id
    AND (_d.branch_id IS NULL
         OR COALESCE(e.branch_id, kt.branch_id, public.pos_order_branch_id(e.order_id)) = _d.branch_id)
    AND (_since IS NULL OR e.created_at > _since)
    AND e.created_at > now() - interval '1 hour'
  ORDER BY e.created_at ASC;
END;
$function$;

-- kds_recall_order: always stamp the resolved branch on the call event
CREATE OR REPLACE FUNCTION public.kds_recall_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_owner UUID;
  v_branch UUID;
  v_display TEXT;
  v_ticket public.kitchen_tickets%ROWTYPE;
  v_company UUID;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL OR v_owner <> v_order.user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_branch := public.pos_order_branch_id(_order_id);

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);

  SELECT * INTO v_ticket FROM public.kitchen_tickets
    WHERE order_id = _order_id ORDER BY created_at DESC LIMIT 1;
  IF v_ticket.id IS NULL THEN RETURN; END IF;

  v_company := COALESCE(v_ticket.company_id, v_ticket.user_id, v_order.company_id, v_order.user_id);

  INSERT INTO public.kds_call_events(
    ticket_id, order_id, company_id, branch_id,
    display_number, event_type, created_by
  ) VALUES (
    v_ticket.id, _order_id, v_company, COALESCE(v_ticket.branch_id, v_branch),
    v_display, 'recall', auth.uid()
  );

  UPDATE public.kitchen_tickets
     SET last_called_at = now(),
         call_count = call_count + 1
   WHERE order_id = _order_id;
END;
$function$;

-- Backfill kitchen_tickets.branch_id (null rows) using session->terminal
UPDATE public.kitchen_tickets kt
   SET branch_id = public.pos_order_branch_id(kt.order_id)
 WHERE kt.branch_id IS NULL
   AND public.pos_order_branch_id(kt.order_id) IS NOT NULL;

-- Backfill kds_call_events.branch_id (null rows)
UPDATE public.kds_call_events e
   SET branch_id = public.pos_order_branch_id(e.order_id)
 WHERE e.branch_id IS NULL
   AND public.pos_order_branch_id(e.order_id) IS NOT NULL;
