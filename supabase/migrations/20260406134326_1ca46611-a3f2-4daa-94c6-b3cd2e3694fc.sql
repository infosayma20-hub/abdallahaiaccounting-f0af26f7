
DROP TABLE IF EXISTS public.webhook_logs;

CREATE TABLE public.webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id UUID,
  order_reference TEXT,
  direction TEXT NOT NULL DEFAULT 'outgoing',
  endpoint TEXT,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_logs_order ON public.webhook_logs(order_id);
CREATE INDEX idx_webhook_logs_user ON public.webhook_logs(user_id);
CREATE INDEX idx_webhook_logs_created ON public.webhook_logs(created_at DESC);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own webhook logs"
ON public.webhook_logs FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own webhook logs"
ON public.webhook_logs FOR INSERT
WITH CHECK (user_id = auth.uid());
