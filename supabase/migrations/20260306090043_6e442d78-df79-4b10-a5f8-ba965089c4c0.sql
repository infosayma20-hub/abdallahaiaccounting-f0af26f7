
-- Create project_contracts table
CREATE TABLE public.project_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contract_number TEXT,
  project_id UUID REFERENCES public.contractor_projects(id) ON DELETE SET NULL,
  
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_address TEXT,
  
  project_name TEXT NOT NULL,
  project_location TEXT,
  contract_value DECIMAL(14,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  duration_text TEXT,
  payment_terms TEXT,
  
  scope_items TEXT[] DEFAULT '{}',
  
  advance_payment DECIMAL(14,2) DEFAULT 0,
  advance_payment_note TEXT,
  total_expenses DECIMAL(14,2) DEFAULT 0,
  total_receipts DECIMAL(14,2) DEFAULT 0,
  
  logo_url TEXT,
  
  terms_obligations TEXT DEFAULT 'يلتزم الطرف الأول (المقاول) بتنفيذ كافة الأعمال الموصوفة في نطاق العمل وفقاً للمواصفات الفنية المعتمدة وضمن الجدول الزمني المحدد.',
  terms_payment TEXT DEFAULT 'يلتزم الطرف الثاني (العميل) بدفع المبالغ المستحقة وفقاً لآلية الدفع المتفق عليها، وأي تأخير في الدفع يخول الطرف الأول إيقاف العمل.',
  terms_disputes TEXT DEFAULT 'في حال نشوء أي خلاف بين الطرفين يتم حله بالتراضي، وإن تعذر ذلك يُحال النزاع إلى المحكمة المختصة.',
  
  notes TEXT,
  status TEXT DEFAULT 'draft',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate contract number
CREATE OR REPLACE FUNCTION public.gen_contract_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.project_contracts
  WHERE user_id = NEW.user_id;
  
  NEW.contract_number := 'CON-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER before_insert_contract
  BEFORE INSERT ON public.project_contracts
  FOR EACH ROW EXECUTE FUNCTION public.gen_contract_number();

-- Updated_at trigger
CREATE TRIGGER update_project_contracts_updated_at
  BEFORE UPDATE ON public.project_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.project_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contracts"
  ON public.project_contracts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can insert own contracts"
  ON public.project_contracts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own contracts"
  ON public.project_contracts FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can delete own contracts"
  ON public.project_contracts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);

CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Anyone can view logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'company-logos');

CREATE POLICY "Users can update own logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-logos');

CREATE POLICY "Users can delete own logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-logos');
