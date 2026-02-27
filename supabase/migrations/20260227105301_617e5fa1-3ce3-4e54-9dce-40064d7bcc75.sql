
-- =============================================
-- جدول الحسابات المحاسبية (Chart of Accounts)
-- =============================================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'عام',
  parent_code TEXT,
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_code)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts" ON public.accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts" ON public.accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts" ON public.accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own non-system accounts" ON public.accounts
  FOR DELETE USING (auth.uid() = user_id AND is_system = false);

CREATE INDEX idx_accounts_user_code ON public.accounts(user_id, account_code);
CREATE INDEX idx_accounts_user_type ON public.accounts(user_id, account_type);

-- =============================================
-- جدول جهات الاتصال (Contacts)
-- =============================================
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_name TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'عميل',
  phone TEXT,
  email TEXT,
  address TEXT,
  linked_account_code TEXT,
  tax_number TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_contacts_user ON public.contacts(user_id);
CREATE INDEX idx_contacts_user_type ON public.contacts(user_id, contact_type);

-- =============================================
-- جدول المعاملات المالية (Transactions / Journal Entries)
-- =============================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  debit_account_code TEXT NOT NULL,
  credit_account_code TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'شيكل',
  transaction_type TEXT NOT NULL DEFAULT 'قيد يومية',
  reference TEXT,
  contact_id UUID REFERENCES public.contacts(id),
  is_opening_balance BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_user_type ON public.transactions(user_id, transaction_type);
CREATE INDEX idx_transactions_user_debit ON public.transactions(user_id, debit_account_code);
CREATE INDEX idx_transactions_user_credit ON public.transactions(user_id, credit_account_code);
CREATE INDEX idx_transactions_contact ON public.transactions(contact_id);

-- Triggers for updated_at
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
