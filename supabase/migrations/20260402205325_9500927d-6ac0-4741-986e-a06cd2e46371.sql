
-- 1. Tax Settings
CREATE TABLE public.tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_name TEXT DEFAULT 'ضريبة القيمة المضافة',
  tax_number TEXT,
  tax_rate DECIMAL(5,2) DEFAULT 16.00,
  registration_type TEXT DEFAULT 'licensed' CHECK (registration_type IN ('licensed', 'exempt', 'unregistered')),
  fiscal_year_start INT DEFAULT 1,
  report_due_day INT DEFAULT 15,
  prices_include_tax BOOLEAN DEFAULT FALSE,
  output_tax_account_code TEXT DEFAULT '2141',
  input_tax_account_code TEXT DEFAULT '1441',
  payable_tax_account_code TEXT DEFAULT '2142',
  refundable_tax_account_code TEXT DEFAULT '1442',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tax_settings"
  ON public.tax_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())))
  WITH CHECK (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())));

-- 2. Tax Categories
CREATE TABLE public.tax_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('standard', 'zero', 'exempt')),
  rate DECIMAL(5,2),
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tax_categories"
  ON public.tax_categories FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())))
  WITH CHECK (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())));

-- 3. Tax Ledger
CREATE TABLE public.tax_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  transaction_date DATE NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id UUID,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('output', 'input')),
  tax_category TEXT DEFAULT 'standard' CHECK (tax_category IN ('standard', 'zero', 'exempt')),
  net_amount DECIMAL(15,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  invoice_number TEXT,
  party_name TEXT,
  party_tax_number TEXT,
  is_deductible BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tax_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tax_ledger"
  ON public.tax_ledger FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())))
  WITH CHECK (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())));

CREATE INDEX idx_tax_ledger_period ON public.tax_ledger(user_id, period_year, period_month);
CREATE INDEX idx_tax_ledger_ref ON public.tax_ledger(reference_type, reference_id);

-- 4. Tax Submissions
CREATE TABLE public.tax_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  period_month INT NOT NULL,
  submission_date DATE,
  output_tax DECIMAL(15,2) DEFAULT 0,
  input_tax DECIMAL(15,2) DEFAULT 0,
  net_tax DECIMAL(15,2) DEFAULT 0,
  payment_amount DECIMAL(15,2) DEFAULT 0,
  payment_date DATE,
  payment_reference TEXT,
  refund_amount DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'paid', 'refund_requested', 'late')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period_year, period_month)
);

ALTER TABLE public.tax_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own tax_submissions"
  ON public.tax_submissions FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())))
  WITH CHECK (user_id = auth.uid() OR user_id = (SELECT public.get_team_owner_id(auth.uid())));
