
-- Opening Balance Batches
CREATE TABLE public.opening_balance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'posted', 'cancelled')),
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opening_balance_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batches" ON public.opening_balance_batches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own batches" ON public.opening_balance_batches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own draft batches" ON public.opening_balance_batches FOR UPDATE USING (auth.uid() = user_id AND status IN ('draft', 'validated'));
CREATE POLICY "Users can delete own draft batches" ON public.opening_balance_batches FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

-- Opening Balance Entries
CREATE TABLE public.opening_balance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.opening_balance_batches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  account_code text,
  account_name text,
  entity_type text NOT NULL DEFAULT 'other' CHECK (entity_type IN ('customer', 'supplier', 'bank', 'check_receivable', 'check_payable', 'inventory', 'fixed_asset', 'cash', 'loan', 'equity', 'other')),
  entity_name text,
  debit_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  metadata jsonb DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opening_balance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entries" ON public.opening_balance_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries" ON public.opening_balance_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries" ON public.opening_balance_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries" ON public.opening_balance_entries FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_opening_balance_batches_updated_at
  BEFORE UPDATE ON public.opening_balance_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
