
-- Replace creation function: UPSERT so repeated triggers refresh items
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

  SELECT s.branch_id INTO v_branch
  FROM public.pos_sessions s WHERE s.id = v_order.session_id;

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
$$;

-- Trigger on pos_order_lines AFTER INSERT (row-level)
CREATE OR REPLACE FUNCTION public.trg_pos_order_lines_kds_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.kds_create_tickets_for_order(NEW.order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_order_lines_kds_sync ON public.pos_order_lines;
CREATE TRIGGER trg_pos_order_lines_kds_sync
  AFTER INSERT ON public.pos_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_pos_order_lines_kds_sync();
