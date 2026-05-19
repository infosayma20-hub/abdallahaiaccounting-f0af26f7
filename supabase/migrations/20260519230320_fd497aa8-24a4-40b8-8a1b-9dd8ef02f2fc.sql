
-- 1) kds_update_ticket_status: set timestamps (ready_at, accepted_at, delivered_at)
CREATE OR REPLACE FUNCTION public.kds_update_ticket_status(_token text, _ticket_id uuid, _status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _ticket public.kitchen_tickets%ROWTYPE;
BEGIN
  IF _status NOT IN ('pending','preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
  IF _device.device_type NOT IN ('kitchen_screen','heater_screen') THEN
    RAISE EXCEPTION 'Device not authorized';
  END IF;

  SELECT * INTO _ticket FROM public.kitchen_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

  IF _ticket.user_id <> _device.company_id THEN
    RAISE EXCEPTION 'Cross-company forbidden';
  END IF;
  IF _device.branch_id IS NOT NULL AND _ticket.branch_id IS NOT NULL
     AND _ticket.branch_id <> _device.branch_id THEN
    RAISE EXCEPTION 'Cross-branch forbidden';
  END IF;

  UPDATE public.kitchen_tickets
     SET status = _status,
         accepted_at = CASE WHEN _status = 'preparing' AND accepted_at IS NULL THEN now() ELSE accepted_at END,
         ready_at    = CASE WHEN _status = 'ready'     AND ready_at    IS NULL THEN now() ELSE ready_at END,
         delivered_at= CASE WHEN _status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
         completed_at= CASE WHEN _status IN ('delivered','cancelled') AND completed_at IS NULL THEN now() ELSE completed_at END,
         updated_at  = now()
   WHERE id = _ticket_id;
  RETURN true;
END;
$function$;

-- 2) kds_create_tickets_for_order: honor pos_kds_auto_preparing
CREATE OR REPLACE FUNCTION public.kds_create_tickets_for_order(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_branch UUID;
  v_kds_enabled BOOLEAN := false;
  v_auto_prep BOOLEAN := false;
  v_default_station UUID;
  v_count INTEGER := 0;
  r RECORD;
  v_display TEXT;
  v_initial_status TEXT;
  v_accepted timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_order.is_return THEN RETURN 0; END IF;
  IF v_order.state IN ('cancelled','draft_cancelled') THEN RETURN 0; END IF;

  SELECT pos_kds_enabled, COALESCE(pos_kds_auto_preparing, false)
    INTO v_kds_enabled, v_auto_prep
  FROM public.company_settings WHERE user_id = v_order.user_id LIMIT 1;
  IF NOT COALESCE(v_kds_enabled, false) THEN RETURN 0; END IF;

  SELECT t.branch_id INTO v_branch
  FROM public.pos_sessions s
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE s.id = v_order.session_id;

  SELECT id INTO v_default_station
  FROM public.kitchen_stations
  WHERE user_id = v_order.user_id AND is_active = true
    AND (branch_id IS NULL OR branch_id = v_branch)
  ORDER BY (branch_id = v_branch) DESC NULLS LAST, display_order ASC
  LIMIT 1;
  IF v_default_station IS NULL THEN RETURN 0; END IF;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);
  v_initial_status := CASE WHEN v_auto_prep THEN 'preparing' ELSE 'pending' END;
  v_accepted := CASE WHEN v_auto_prep THEN now() ELSE NULL END;

  FOR r IN
    SELECT COALESCE(p.kitchen_station_id, v_default_station) AS station_id,
           jsonb_agg(
             jsonb_build_object(
               'product_id', l.product_id,
               'name', l.product_name,
               'qty', l.qty,
               'note', l.notes
             ) ORDER BY l.created_at
           ) AS items
    FROM public.pos_order_lines l
    LEFT JOIN public.products p ON p.id = l.product_id
    WHERE l.order_id = _order_id
    GROUP BY COALESCE(p.kitchen_station_id, v_default_station)
  LOOP
    INSERT INTO public.kitchen_tickets (
      user_id, order_id, station_id, status, items,
      display_number, company_id, branch_id, accepted_at
    ) VALUES (
      v_order.user_id, _order_id, r.station_id,
      v_initial_status, r.items, v_display, v_order.company_id, v_branch, v_accepted
    )
    ON CONFLICT (order_id, station_id) DO UPDATE
      SET items = EXCLUDED.items,
          display_number = COALESCE(public.kitchen_tickets.display_number, EXCLUDED.display_number),
          status = CASE
            WHEN public.kitchen_tickets.status = 'pending' AND v_auto_prep THEN 'preparing'
            ELSE public.kitchen_tickets.status
          END,
          accepted_at = COALESCE(public.kitchen_tickets.accepted_at, EXCLUDED.accepted_at),
          updated_at = now()
      WHERE public.kitchen_tickets.status IN ('pending','preparing');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- 3) kds_get_active_orders: enforce auto-hide for 'ready' tickets
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
      AND (_device.branch_id IS NULL OR kt.branch_id IS NULL OR kt.branch_id = _device.branch_id)
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

-- 4) Backfill ready_at for already-ready tickets so auto-hide works retroactively
UPDATE public.kitchen_tickets
   SET ready_at = COALESCE(updated_at, now())
 WHERE status = 'ready' AND ready_at IS NULL;
