-- Fix: pos_sessions has no branch_id column; resolve branch via pos_terminals.

-- 1) Trigger: assign_kds_daily_display_number
CREATE OR REPLACE FUNCTION public.assign_kds_daily_display_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled BOOLEAN := false;
  v_reset BOOLEAN := true;
  v_start INTEGER := 1;
  v_branch UUID;
  v_business_date DATE;
  v_lock_key BIGINT;
  v_max INTEGER;
BEGIN
  IF NEW.is_return THEN RETURN NEW; END IF;
  IF NEW.daily_display_number IS NOT NULL THEN RETURN NEW; END IF;

  SELECT pos_kds_enabled, pos_kds_daily_number_reset, pos_kds_daily_number_start
    INTO v_enabled, v_reset, v_start
  FROM public.company_settings
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  -- Resolve branch via terminal (pos_sessions has no branch_id)
  SELECT t.branch_id INTO v_branch
  FROM public.pos_sessions s
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE s.id = NEW.session_id;

  v_business_date := public.kds_business_date(COALESCE(NEW.created_at, now()));

  v_lock_key := abs(hashtextextended(
    NEW.company_id::text || COALESCE(v_branch::text,'-') || v_business_date::text,
    42
  ));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_reset THEN
    SELECT COALESCE(MAX(daily_display_number), v_start - 1)
      INTO v_max
    FROM public.pos_orders po
    LEFT JOIN public.pos_sessions s ON s.id = po.session_id
    LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
    WHERE po.company_id = NEW.company_id
      AND COALESCE(t.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(v_branch, '00000000-0000-0000-0000-000000000000'::uuid)
      AND public.kds_business_date(po.created_at) = v_business_date
      AND po.daily_display_number IS NOT NULL;
  ELSE
    SELECT COALESCE(MAX(daily_display_number), v_start - 1)
      INTO v_max
    FROM public.pos_orders
    WHERE company_id = NEW.company_id
      AND daily_display_number IS NOT NULL;
  END IF;

  NEW.daily_display_number := GREATEST(v_max + 1, v_start);
  RETURN NEW;
END;
$function$;

-- 2) kds_create_tickets_for_order
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
  v_default_station UUID;
  v_count INTEGER := 0;
  r RECORD;
  v_display TEXT;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_order.is_return THEN RETURN 0; END IF;
  IF v_order.state IN ('cancelled','draft_cancelled') THEN RETURN 0; END IF;

  SELECT pos_kds_enabled INTO v_kds_enabled
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
      display_number, company_id, branch_id
    ) VALUES (
      v_order.user_id, _order_id, r.station_id,
      'pending', r.items, v_display, v_order.company_id, v_branch
    )
    ON CONFLICT (order_id, station_id) DO UPDATE
      SET items = EXCLUDED.items,
          display_number = COALESCE(public.kitchen_tickets.display_number, EXCLUDED.display_number),
          updated_at = now()
      WHERE public.kitchen_tickets.status = 'pending';
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- 3) kds_recall_order
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
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL OR v_owner <> v_order.user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT t.branch_id INTO v_branch
  FROM public.pos_sessions s
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE s.id = v_order.session_id;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);

  SELECT * INTO v_ticket FROM public.kitchen_tickets
    WHERE order_id = _order_id ORDER BY created_at DESC LIMIT 1;

  IF v_ticket.id IS NULL THEN RETURN; END IF;

  INSERT INTO public.kds_call_events(
    ticket_id, order_id, company_id, branch_id,
    display_number, event_type, created_by
  ) VALUES (
    v_ticket.id, _order_id, v_order.company_id, v_branch,
    v_display, 'recall', auth.uid()
  );

  UPDATE public.kitchen_tickets
     SET last_called_at = now(),
         call_count = call_count + 1
   WHERE order_id = _order_id;
END;
$function$;

-- 4) kds_get_active_tickets — resolve branch via terminal
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
  WHERE kt.company_id = _device.company_id
    AND (_device.branch_id IS NULL OR po.session_id IN (
          SELECT s.id FROM public.pos_sessions s
          JOIN public.pos_terminals t ON t.id = s.terminal_id
          WHERE t.branch_id = _device.branch_id
        ))
    AND kt.status IN ('pending','preparing','ready')
    AND kt.created_at >= _today_start
  ORDER BY kt.created_at ASC;
END;
$function$;