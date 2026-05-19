
-- =====================================================================
-- KDS Phase 2: Auto-create kitchen tickets, daily display numbers,
-- order-level call orchestration.
-- =====================================================================

-- 1) Settings -------------------------------------------------------------
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_kds_daily_number_start INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pos_kds_daily_number_reset BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pos_kds_display_number_source TEXT NOT NULL DEFAULT 'short_daily_number';
  -- 'short_daily_number' | 'order_number'

-- 2) pos_orders: short daily number + auto-call sentinel ------------------
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS daily_display_number INTEGER,
  ADD COLUMN IF NOT EXISTS kds_auto_called_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pos_orders_daily_display
  ON public.pos_orders(company_id, created_at DESC)
  WHERE daily_display_number IS NOT NULL;

-- 3) kds_call_events: link to order + prevent duplicate auto calls --------
ALTER TABLE public.kds_call_events
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.pos_orders(id) ON DELETE CASCADE;

-- Unique partial index: only one auto-call per order
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kds_auto_call_per_order
  ON public.kds_call_events(order_id)
  WHERE event_type = 'auto_call' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kds_call_events_order
  ON public.kds_call_events(order_id) WHERE order_id IS NOT NULL;

-- 4) kitchen_tickets: prevent duplicate (order_id, station_id) ------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kitchen_ticket_order_station
  ON public.kitchen_tickets(order_id, station_id);

-- 5) Helper: business date (6 AM cutoff, Asia/Hebron) ---------------------
CREATE OR REPLACE FUNCTION public.kds_business_date(_at TIMESTAMPTZ DEFAULT now())
RETURNS DATE
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (_at AT TIME ZONE 'Asia/Hebron')) < 6
      THEN ((_at AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day')::date
    ELSE (_at AT TIME ZONE 'Asia/Hebron')::date
  END;
$$;

-- 6) Generate short daily display number ----------------------------------
-- BEFORE INSERT on pos_orders. Runs only when KDS enabled.
CREATE OR REPLACE FUNCTION public.assign_kds_daily_display_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN := false;
  v_reset BOOLEAN := true;
  v_start INTEGER := 1;
  v_branch UUID;
  v_business_date DATE;
  v_lock_key BIGINT;
  v_max INTEGER;
BEGIN
  -- Skip returns
  IF NEW.is_return THEN RETURN NEW; END IF;
  IF NEW.daily_display_number IS NOT NULL THEN RETURN NEW; END IF;

  SELECT pos_kds_enabled, pos_kds_daily_number_reset, pos_kds_daily_number_start
    INTO v_enabled, v_reset, v_start
  FROM public.company_settings
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF NOT COALESCE(v_enabled, false) THEN RETURN NEW; END IF;

  -- Resolve branch from session
  SELECT s.branch_id INTO v_branch
  FROM public.pos_sessions s WHERE s.id = NEW.session_id;

  v_business_date := public.kds_business_date(COALESCE(NEW.created_at, now()));

  -- Advisory lock keyed by (company, branch, date) to serialize
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
    WHERE po.company_id = NEW.company_id
      AND COALESCE(s.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
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
$$;

DROP TRIGGER IF EXISTS trg_assign_kds_daily_display ON public.pos_orders;
CREATE TRIGGER trg_assign_kds_daily_display
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_kds_daily_display_number();

-- 7) Auto-create kitchen tickets from order lines -------------------------
-- Strategy: trigger fires when order becomes 'confirmed' or 'paid'.
-- We split lines by products.kitchen_station_id; lines without a station
-- fall back to the first active station for the user (default station).
CREATE OR REPLACE FUNCTION public.kds_create_tickets_for_order(_order_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_branch UUID;
  v_kds_enabled BOOLEAN := false;
  v_default_station UUID;
  v_created INTEGER := 0;
  r RECORD;
  v_items JSONB;
  v_display TEXT;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Skip returns / cancelled
  IF v_order.is_return THEN RETURN 0; END IF;
  IF v_order.state IN ('cancelled','draft_cancelled') THEN RETURN 0; END IF;

  SELECT pos_kds_enabled INTO v_kds_enabled
  FROM public.company_settings WHERE user_id = v_order.user_id LIMIT 1;
  IF NOT COALESCE(v_kds_enabled, false) THEN RETURN 0; END IF;

  SELECT s.branch_id INTO v_branch
  FROM public.pos_sessions s WHERE s.id = v_order.session_id;

  -- Default station fallback
  SELECT id INTO v_default_station
  FROM public.kitchen_stations
  WHERE user_id = v_order.user_id AND is_active = true
    AND (branch_id IS NULL OR branch_id = v_branch)
  ORDER BY (branch_id = v_branch) DESC NULLS LAST, display_order ASC
  LIMIT 1;

  IF v_default_station IS NULL THEN RETURN 0; END IF;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text, ''), v_order.order_number);

  -- Group lines by station
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
    BEGIN
      INSERT INTO public.kitchen_tickets (
        user_id, order_id, station_id, status, items,
        display_number, company_id, branch_id
      ) VALUES (
        v_order.user_id, v_order.id, r.station_id,
        'pending', r.items,
        v_display, v_order.company_id, v_branch
      );
      v_created := v_created + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Already exists (re-trigger): skip
      NULL;
    END;
  END LOOP;

  RETURN v_created;
END;
$$;

-- AFTER UPDATE on pos_orders: when state transitions to confirmed/paid
CREATE OR REPLACE FUNCTION public.trg_pos_orders_kds_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_states TEXT[] := ARRAY['confirmed','paid','open'];
BEGIN
  -- Cancellation: drop active tickets
  IF NEW.state IN ('cancelled','draft_cancelled') AND OLD.state IS DISTINCT FROM NEW.state THEN
    DELETE FROM public.kitchen_tickets
     WHERE order_id = NEW.id AND status IN ('pending','preparing');
    UPDATE public.kitchen_tickets
       SET status = 'cancelled'
     WHERE order_id = NEW.id AND status = 'ready';
    RETURN NEW;
  END IF;

  -- Create tickets when entering an active state
  IF NEW.state = ANY(v_active_states) AND OLD.state IS DISTINCT FROM NEW.state THEN
    PERFORM public.kds_create_tickets_for_order(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_kds_sync ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_kds_sync
  AFTER UPDATE OF state ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_pos_orders_kds_sync();

-- Also fire on INSERT in case order is created already in active state
CREATE OR REPLACE FUNCTION public.trg_pos_orders_kds_sync_ins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state IN ('confirmed','paid','open') AND NOT NEW.is_return THEN
    -- Defer to after lines are inserted: caller should call RPC manually
    -- or this fires once lines exist; we still attempt now (no-op if no lines)
    PERFORM public.kds_create_tickets_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_kds_sync_ins ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_kds_sync_ins
  AFTER INSERT ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_pos_orders_kds_sync_ins();

-- 8) Order-level call orchestration ---------------------------------------
-- When all tickets of an order are 'ready' -> emit ONE auto_call event.
CREATE OR REPLACE FUNCTION public.trg_kitchen_tickets_order_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_ready INTEGER;
  v_order public.pos_orders%ROWTYPE;
  v_display TEXT;
BEGIN
  IF NEW.status NOT IN ('ready') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT COUNT(*) FILTER (WHERE status IN ('pending','preparing','ready')) AS total,
         COUNT(*) FILTER (WHERE status = 'ready') AS ready
    INTO v_total, v_ready
  FROM public.kitchen_tickets
  WHERE order_id = NEW.order_id;

  IF v_total = 0 OR v_ready < v_total THEN RETURN NEW; END IF;

  SELECT * INTO v_order FROM public.pos_orders WHERE id = NEW.order_id;
  IF v_order.kds_auto_called_at IS NOT NULL THEN RETURN NEW; END IF;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);

  BEGIN
    INSERT INTO public.kds_call_events(
      ticket_id, order_id, company_id, branch_id,
      display_number, event_type
    ) VALUES (
      NEW.id, NEW.order_id, NEW.company_id, NEW.branch_id,
      v_display, 'auto_call'
    );
    UPDATE public.pos_orders
       SET kds_auto_called_at = now()
     WHERE id = NEW.order_id;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kitchen_tickets_order_ready ON public.kitchen_tickets;
CREATE TRIGGER trg_kitchen_tickets_order_ready
  AFTER UPDATE OF status ON public.kitchen_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_kitchen_tickets_order_ready();

-- 9) RPC: active orders for customer display ------------------------------
-- Aggregates tickets per order; returns one row per order.
CREATE OR REPLACE FUNCTION public.kds_get_active_orders(_token TEXT)
RETURNS TABLE(
  order_id UUID,
  display_number TEXT,
  order_number TEXT,
  status TEXT,           -- 'preparing' | 'ready'
  ready_at TIMESTAMPTZ,
  last_called_at TIMESTAMPTZ,
  call_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
             WHEN COUNT(*) = COUNT(*) FILTER (WHERE status='ready') THEN 'ready'
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
    -- Auto-hide ready orders after configured seconds
    NOT (a.agg_status = 'ready'
         AND a.ready_at IS NOT NULL
         AND a.ready_at < now() - make_interval(secs => _hide_seconds))
  ORDER BY a.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kds_get_active_orders(TEXT) TO anon, authenticated;

-- 10) RPC: recall an order (manual) ---------------------------------------
CREATE OR REPLACE FUNCTION public.kds_recall_order(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT s.branch_id INTO v_branch
  FROM public.pos_sessions s WHERE s.id = v_order.session_id;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);

  -- Find any ticket of the order for FK
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
$$;

GRANT EXECUTE ON FUNCTION public.kds_recall_order(UUID) TO authenticated;
