
-- Contractor Projects table
CREATE TABLE public.contractor_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  client_name TEXT,
  budget NUMERIC DEFAULT 0,
  total_expenses NUMERIC DEFAULT 0,
  total_receipts NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contractor_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contractor projects"
  ON public.contractor_projects FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Contractor Transactions table
CREATE TABLE public.contractor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.contractor_projects(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense', -- expense, receipt, cheque
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  category TEXT,
  supplier TEXT,
  payment_method TEXT DEFAULT 'نقدي',
  cheque_number TEXT,
  cheque_date DATE,
  cheque_status TEXT DEFAULT 'pending',
  transaction_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  linked_account_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contractor_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own contractor transactions"
  ON public.contractor_transactions FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Trigger to update project totals
CREATE OR REPLACE FUNCTION public.update_contractor_project_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.contractor_projects SET
    total_expenses = COALESCE((
      SELECT SUM(amount) FROM public.contractor_transactions
      WHERE project_id = COALESCE(NEW.project_id, OLD.project_id) AND type = 'expense'
    ), 0),
    total_receipts = COALESCE((
      SELECT SUM(amount) FROM public.contractor_transactions
      WHERE project_id = COALESCE(NEW.project_id, OLD.project_id) AND type = 'receipt'
    ), 0),
    updated_at = now()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_contractor_totals
AFTER INSERT OR UPDATE OR DELETE ON public.contractor_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_contractor_project_totals();
