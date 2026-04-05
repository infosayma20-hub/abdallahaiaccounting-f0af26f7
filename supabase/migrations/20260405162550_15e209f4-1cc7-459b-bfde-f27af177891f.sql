
-- Shared statement links table
CREATE TABLE public.shared_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  company_id UUID,
  contact_id UUID,
  contact_name TEXT,
  user_id UUID NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  viewed_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  balance_amount NUMERIC DEFAULT 0
);

ALTER TABLE public.shared_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own shared statements"
  ON public.shared_statements FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Statement send log table
CREATE TABLE public.statement_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_statement_id UUID REFERENCES public.shared_statements(id),
  company_id UUID,
  contact_id UUID,
  contact_name TEXT,
  contact_phone TEXT,
  sent_via TEXT DEFAULT 'whatsapp',
  sent_by UUID,
  user_id UUID NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  balance_at_send NUMERIC
);

ALTER TABLE public.statement_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own send logs"
  ON public.statement_send_log FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
