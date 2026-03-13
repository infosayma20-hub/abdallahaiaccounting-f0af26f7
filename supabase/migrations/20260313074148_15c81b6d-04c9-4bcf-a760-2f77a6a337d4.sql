
-- Receipt vouchers table (separate from billing payments)
CREATE TABLE public.receipt_vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  receipt_number VARCHAR(20),
  contact_id UUID REFERENCES public.contacts(id),
  contact_name TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) DEFAULT 'نقدي',
  check_number VARCHAR(50),
  check_date DATE,
  bank_name VARCHAR(100),
  cash_box_id UUID REFERENCES public.cash_boxes(id),
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  deposit_account_code VARCHAR(20),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'posted',
  linked_transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment-Invoice links
CREATE TABLE public.payment_invoice_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID REFERENCES public.receipt_vouchers(id) ON DELETE CASCADE NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id) NOT NULL,
  allocated_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.receipt_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoice_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for receipt_vouchers
CREATE POLICY "Users can view own receipts" ON public.receipt_vouchers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can insert own receipts" ON public.receipt_vouchers
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own receipts" ON public.receipt_vouchers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- RLS for payment_invoice_links
CREATE POLICY "Users can view own payment links" ON public.payment_invoice_links
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receipt_vouchers p WHERE p.id = payment_id AND (p.user_id = auth.uid() OR public.is_team_member(auth.uid(), p.user_id))));

CREATE POLICY "Users can insert own payment links" ON public.payment_invoice_links
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.receipt_vouchers p WHERE p.id = payment_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete own payment links" ON public.payment_invoice_links
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receipt_vouchers p WHERE p.id = payment_id AND p.user_id = auth.uid()));

-- Auto-generate receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_voucher_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.receipt_number IS NOT NULL AND NEW.receipt_number != '' THEN
    RETURN NEW;
  END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.receipt_vouchers
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.receipt_number := 'REC-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_receipt_voucher_number
  BEFORE INSERT ON public.receipt_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.generate_receipt_voucher_number();
