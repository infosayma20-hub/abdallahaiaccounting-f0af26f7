CREATE TABLE public.pos_network_diagnostics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID,
  session_id UUID,
  terminal_id TEXT,
  device_label TEXT,
  event_type TEXT NOT NULL,
  detail TEXT,
  sources JSONB,
  connection_info JSONB,
  occurred_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pnd_user_time ON public.pos_network_diagnostics(user_id, occurred_at DESC);
CREATE INDEX idx_pnd_terminal_time ON public.pos_network_diagnostics(terminal_id, occurred_at DESC);
CREATE INDEX idx_pnd_event ON public.pos_network_diagnostics(event_type);

GRANT SELECT, INSERT ON public.pos_network_diagnostics TO authenticated;
GRANT ALL ON public.pos_network_diagnostics TO service_role;

ALTER TABLE public.pos_network_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert network diagnostics for their owner scope"
  ON public.pos_network_diagnostics FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR user_id = public.resolve_effective_owner_id(auth.uid())
    OR user_id = public.get_team_owner_id(auth.uid())
  );

CREATE POLICY "Users read network diagnostics for their owner scope"
  ON public.pos_network_diagnostics FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id = public.resolve_effective_owner_id(auth.uid())
    OR user_id = public.get_team_owner_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );