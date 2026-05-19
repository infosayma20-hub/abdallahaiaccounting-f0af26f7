
-- 1) Company settings: public base URL + voice mode
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS kds_public_base_url TEXT,
  ADD COLUMN IF NOT EXISTS pos_kds_voice_mode TEXT NOT NULL DEFAULT 'browser_tts'
    CHECK (pos_kds_voice_mode IN ('cached_arabic_audio','browser_tts','beep_only'));

-- 2) Cached TTS audio bucket (public read, no listing — readers need exact path)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('kds-audio-cache', 'kds-audio-cache', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kds-audio-cache public read" ON storage.objects;
CREATE POLICY "kds-audio-cache public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'kds-audio-cache');

-- 3) RPC: fetch kitchen tickets for a token-authenticated device
CREATE OR REPLACE FUNCTION public.kds_get_kitchen_tickets(_token TEXT)
RETURNS TABLE(
  id UUID,
  order_id UUID,
  station_id UUID,
  status TEXT,
  items JSONB,
  created_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  order_number TEXT,
  daily_display_number INTEGER,
  table_name TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.kds_get_kitchen_tickets(TEXT) TO anon, authenticated;

-- 4) RPC: update ticket status (device must own the branch)
CREATE OR REPLACE FUNCTION public.kds_update_ticket_status(
  _token TEXT, _ticket_id UUID, _status TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF _ticket.company_id <> _device.company_id THEN
    RAISE EXCEPTION 'Cross-company forbidden';
  END IF;
  IF _device.branch_id IS NOT NULL AND _ticket.branch_id IS NOT NULL
     AND _ticket.branch_id <> _device.branch_id THEN
    RAISE EXCEPTION 'Cross-branch forbidden';
  END IF;

  UPDATE public.kitchen_tickets SET status = _status WHERE id = _ticket_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.kds_update_ticket_status(TEXT, UUID, TEXT) TO anon, authenticated;

-- 5) RPC: recall an order from heater screen
CREATE OR REPLACE FUNCTION public.kds_recall_order_by_token(_token TEXT, _order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _order public.pos_orders%ROWTYPE;
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
  IF _device.device_type NOT IN ('kitchen_screen','heater_screen') THEN
    RAISE EXCEPTION 'Device not authorized';
  END IF;

  SELECT * INTO _order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _order.user_id <> _device.company_id THEN
    RAISE EXCEPTION 'Cross-company forbidden';
  END IF;
  IF _device.branch_id IS NOT NULL AND _order.branch_id IS NOT NULL
     AND _order.branch_id <> _device.branch_id THEN
    RAISE EXCEPTION 'Cross-branch forbidden';
  END IF;

  PERFORM public.kds_recall_order(_order_id);
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.kds_recall_order_by_token(TEXT, UUID) TO anon, authenticated;
