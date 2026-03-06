
-- Create financial_claims table
CREATE TABLE public.financial_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID REFERENCES public.contractor_projects(id) ON DELETE CASCADE,
  claim_number TEXT,

  recipient_name TEXT NOT NULL,
  recipient_address TEXT,

  claim_date DATE DEFAULT CURRENT_DATE,
  amount DECIMAL(14,2) NOT NULL,
  amount_text TEXT,
  due_date DATE,
  reply_days INTEGER DEFAULT 7,

  custom_note TEXT,

  status TEXT DEFAULT 'draft',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate claim number
CREATE OR REPLACE FUNCTION public.gen_claim_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.financial_claims
  WHERE user_id = NEW.user_id;

  NEW.claim_number := 'CLM-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER before_insert_claim
  BEFORE INSERT ON public.financial_claims
  FOR EACH ROW EXECUTE FUNCTION public.gen_claim_number();

CREATE TRIGGER update_financial_claims_updated_at
  BEFORE UPDATE ON public.financial_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.financial_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own claims"
  ON public.financial_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can insert own claims"
  ON public.financial_claims FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own claims"
  ON public.financial_claims FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can delete own claims"
  ON public.financial_claims FOR DELETE TO authenticated
  USING (user_id = auth.uid());
