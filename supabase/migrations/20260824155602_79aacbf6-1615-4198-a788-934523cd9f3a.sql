CREATE TABLE public.compensations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  party_kind TEXT NOT NULL DEFAULT 'أخرى',
  party_name TEXT NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  complaint_id UUID REFERENCES public.customer_complaints(id) ON DELETE SET NULL,
  compensation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ILS',
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'قيد المتابعة',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_compensations_owner_date ON public.compensations (user_id, compensation_date DESC);
CREATE INDEX idx_compensations_employee ON public.compensations (employee_id) WHERE employee_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compensations TO authenticated;
GRANT ALL ON public.compensations TO service_role;

ALTER TABLE public.compensations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage compensations" ON public.compensations
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_compensations_updated_at
  BEFORE UPDATE ON public.compensations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();