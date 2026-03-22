
-- Table to store incoming PBX call events for POS integration
CREATE TABLE public.pbx_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  caller_number TEXT NOT NULL,
  called_number TEXT,
  call_id TEXT,
  trunk_name TEXT,
  customer_id UUID REFERENCES public.pos_customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  status TEXT NOT NULL DEFAULT 'ringing',
  handled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.pbx_call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own call events"
  ON public.pbx_call_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Service can insert call events"
  ON public.pbx_call_events FOR INSERT
  WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pbx_call_events;

-- Index for quick lookups
CREATE INDEX idx_pbx_call_events_user_handled ON public.pbx_call_events(user_id, handled, created_at DESC);
