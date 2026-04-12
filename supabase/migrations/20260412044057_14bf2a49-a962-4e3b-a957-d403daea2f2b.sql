
-- Table for leads from Sami chatbot
CREATE TABLE public.sami_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_type TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  conversation_log JSONB DEFAULT '[]'::jsonb,
  source TEXT DEFAULT 'sami_chatbot',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sami_leads ENABLE ROW LEVEL SECURITY;

-- Only super_admin can access leads
CREATE POLICY "Super admins can view all leads"
ON public.sami_leads FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update leads"
ON public.sami_leads FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete leads"
ON public.sami_leads FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Allow anonymous inserts (from chatbot - no auth needed)
CREATE POLICY "Anyone can insert leads"
ON public.sami_leads FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.sami_leads;
