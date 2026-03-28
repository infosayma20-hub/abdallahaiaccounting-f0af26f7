
-- Recurring invoices table
CREATE TABLE public.recurring_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_name TEXT NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'sale',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  interval_value INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  next_due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_generated_at TIMESTAMPTZ,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'ILS',
  payment_method TEXT DEFAULT 'cash',
  payment_terms TEXT,
  notes TEXT,
  auto_send BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  generated_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recurring invoices"
ON public.recurring_invoices FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX idx_recurring_invoices_next_due ON public.recurring_invoices(next_due_date) WHERE is_active = true;
CREATE INDEX idx_recurring_invoices_user ON public.recurring_invoices(user_id);
