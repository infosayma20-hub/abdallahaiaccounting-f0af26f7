
-- Network printers table for POS
CREATE TABLE public.pos_printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 9100,
  printer_type TEXT NOT NULL DEFAULT 'escpos',
  paper_width INTEGER NOT NULL DEFAULT 80,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  station_ids UUID[] DEFAULT '{}',
  print_categories TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.pos_printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own printers" ON public.pos_printers
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
