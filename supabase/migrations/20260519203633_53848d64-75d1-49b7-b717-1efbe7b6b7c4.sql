-- ====================================================================
-- KDS + Customer Display Foundation (Phase 1)
-- Generic feature; default OFF for all companies.
-- ====================================================================

-- 1) Settings on company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pos_kds_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_customer_display_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pos_voice_call_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pos_voice_language text NOT NULL DEFAULT 'ar-PS',
  ADD COLUMN IF NOT EXISTS pos_voice_template text NOT NULL DEFAULT 'طلب رقم {n}، تفضل للاستلام',
  ADD COLUMN IF NOT EXISTS pos_ready_auto_hide_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS pos_call_repeat_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pos_call_number_strategy text NOT NULL DEFAULT 'order_number',
  ADD COLUMN IF NOT EXISTS pos_kds_show_order_types jsonb NOT NULL DEFAULT '["dine_in","takeaway","delivery"]'::jsonb,
  ADD COLUMN IF NOT EXISTS pos_kds_auto_preparing boolean NOT NULL DEFAULT true;

-- 2) Extend kitchen_tickets (preserve existing data)
ALTER TABLE public.kitchen_tickets
  ADD COLUMN IF NOT EXISTS display_number text,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_called_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS branch_id uuid;

-- Backfill company_id from owner via pos_orders if possible (best-effort).
UPDATE public.kitchen_tickets kt
SET company_id = po.company_id
FROM public.pos_orders po
WHERE kt.order_id = po.id AND kt.company_id IS NULL;

-- 3) Trigger: set ready_at / delivered_at when status changes
CREATE OR REPLACE FUNCTION public.kitchen_tickets_status_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'ready' AND NEW.ready_at IS NULL THEN NEW.ready_at = now(); END IF;
    IF NEW.status = 'served' AND NEW.delivered_at IS NULL THEN NEW.delivered_at = now(); END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.status = 'ready' AND (OLD.status IS DISTINCT FROM 'ready') AND NEW.ready_at IS NULL THEN
      NEW.ready_at = now();
    END IF;
    IF NEW.status = 'served' AND (OLD.status IS DISTINCT FROM 'served') AND NEW.delivered_at IS NULL THEN
      NEW.delivered_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kitchen_tickets_status_stamp_trg ON public.kitchen_tickets;
CREATE TRIGGER kitchen_tickets_status_stamp_trg
BEFORE INSERT OR UPDATE ON public.kitchen_tickets
FOR EACH ROW EXECUTE FUNCTION public.kitchen_tickets_status_stamp();

-- 4) KDS call events table
CREATE TABLE IF NOT EXISTS public.kds_call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.kitchen_tickets(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  branch_id uuid,
  display_number text,
  event_type text NOT NULL DEFAULT 'call', -- call | recall | delivered
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kds_call_events_company_created ON public.kds_call_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kds_call_events_ticket ON public.kds_call_events(ticket_id);

ALTER TABLE public.kds_call_events ENABLE ROW LEVEL SECURITY;

-- 5) Display devices (token-based public access for the customer screen)
CREATE TABLE IF NOT EXISTS public.pos_display_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  branch_id uuid,
  name text NOT NULL,
  device_role text NOT NULL DEFAULT 'customer_display', -- customer_display | kitchen_display
  token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_display_devices_company ON public.pos_display_devices(company_id);

ALTER TABLE public.pos_display_devices ENABLE ROW LEVEL SECURITY;

-- Owner can manage their devices
CREATE POLICY "owners manage display devices"
ON public.pos_display_devices
FOR ALL
TO authenticated
USING (company_id = public.get_team_owner_id(auth.uid()))
WITH CHECK (company_id = public.get_team_owner_id(auth.uid()));

-- 6) Public RPC for display screen (no auth, uses device token)
CREATE OR REPLACE FUNCTION public.kds_get_active_tickets(_token text)
RETURNS TABLE (
  id uuid,
  display_number text,
  order_number text,
  status text,
  station_id uuid,
  ready_at timestamptz,
  last_called_at timestamptz,
  call_count integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _today_start timestamptz := date_trunc('day', now());
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.kds_get_active_tickets(text) TO anon, authenticated;

-- RLS for kds_call_events (owner read/write)
CREATE POLICY "owners read call events"
ON public.kds_call_events FOR SELECT TO authenticated
USING (company_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "owners insert call events"
ON public.kds_call_events FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_team_owner_id(auth.uid()));

-- 7) Realtime publication
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_tickets';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_call_events';
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
