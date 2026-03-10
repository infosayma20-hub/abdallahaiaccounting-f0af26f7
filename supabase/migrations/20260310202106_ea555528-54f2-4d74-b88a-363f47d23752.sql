
-- Bank Accounts
CREATE TABLE public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  branch TEXT,
  account_number TEXT,
  account_type TEXT DEFAULT 'current',
  currency TEXT DEFAULT 'ILS',
  gl_account_code TEXT,
  commission_account_code TEXT,
  outgoing_checks_account_code TEXT,
  incoming_checks_account_code TEXT,
  opening_balance DECIMAL(15,3) DEFAULT 0,
  opening_balance_date DATE,
  min_balance_alert DECIMAL(15,3),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bank_accounts"
  ON public.bank_accounts FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Vouchers (unified for receipt, payment, journal)
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receipt', 'payment', 'journal')),
  subtype TEXT DEFAULT 'normal',
  ref_number TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_id UUID,
  payment_method TEXT,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  amount DECIMAL(15,3),
  currency TEXT DEFAULT 'ILS',
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  amount_ils DECIMAL(15,3),
  description TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  cheque_number TEXT,
  cheque_due_date DATE,
  cheque_bank_name TEXT,
  posted_by UUID,
  posted_at TIMESTAMPTZ,
  linked_transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own vouchers"
  ON public.vouchers FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Voucher Lines (journal entry lines)
CREATE TABLE public.voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE CASCADE NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT,
  debit DECIMAL(15,3) DEFAULT 0,
  credit DECIMAL(15,3) DEFAULT 0,
  description TEXT,
  line_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.voucher_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage voucher_lines through vouchers"
  ON public.voucher_lines FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vouchers v 
      WHERE v.id = voucher_id 
      AND (v.user_id = auth.uid() OR public.is_team_member(auth.uid(), v.user_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vouchers v 
      WHERE v.id = voucher_id 
      AND (v.user_id = auth.uid() OR public.is_team_member(auth.uid(), v.user_id))
    )
  );

-- Generate voucher ref numbers
CREATE OR REPLACE FUNCTION public.generate_voucher_ref_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.type
    WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PV'
    WHEN 'journal' THEN 'QV'
    ELSE 'VCH'
  END;

  SELECT COUNT(*) + 1 INTO v_count
  FROM public.vouchers
  WHERE user_id = NEW.user_id AND type = NEW.type;

  NEW.ref_number := v_prefix || '-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_voucher_ref
  BEFORE INSERT ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.generate_voucher_ref_number();
