
-- Add new columns to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS salesperson_id UUID,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS notes_internal TEXT,
  ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS amount_in_words TEXT,
  ADD COLUMN IF NOT EXISTS sent_via TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'net_30',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1;

-- Add new columns to invoice_items table
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) DEFAULT 'قطعة',
  ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) DEFAULT 'percent';

-- Create invoice_payments table
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'cash',
  check_number VARCHAR(50),
  check_date DATE,
  bank_account_id UUID,
  cash_box_id UUID,
  notes TEXT,
  linked_transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own invoice payments"
  ON public.invoice_payments
  FOR ALL USING (user_id = auth.uid());

-- Create invoice_activity_log table
CREATE TABLE IF NOT EXISTS public.invoice_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  details JSONB DEFAULT '{}',
  performed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoice_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own invoice activity"
  ON public.invoice_activity_log
  FOR ALL USING (user_id = auth.uid());
