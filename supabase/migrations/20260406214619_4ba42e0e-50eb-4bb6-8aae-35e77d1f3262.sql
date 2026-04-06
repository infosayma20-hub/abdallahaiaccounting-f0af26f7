
CREATE TABLE IF NOT EXISTS public.sync_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  reference TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_audit_user ON public.sync_audit_log(user_id, created_at DESC);

ALTER TABLE public.sync_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit logs" ON public.sync_audit_log
  FOR SELECT USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Service role can insert audit logs" ON public.sync_audit_log
  FOR INSERT WITH CHECK (true);
