
-- Kitchen stations table
CREATE TABLE public.kitchen_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  station_type TEXT NOT NULL DEFAULT 'kitchen',
  color TEXT DEFAULT '#ef4444',
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kitchen_stations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stations" ON public.kitchen_stations
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Add station_id to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS kitchen_station_id UUID REFERENCES public.kitchen_stations(id) ON DELETE SET NULL;

-- Kitchen tickets table (tracks sent tickets per order per station)
CREATE TABLE public.kitchen_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.kitchen_stations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]',
  printed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.kitchen_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tickets" ON public.kitchen_tickets
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Enable realtime for kitchen tickets
ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_tickets;
