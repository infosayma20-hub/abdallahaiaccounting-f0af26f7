CREATE TABLE public.employee_letter_prints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  company_id UUID,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  letter_type TEXT NOT NULL DEFAULT 'employment_verification',
  reference_number TEXT,
  printed_by UUID NOT NULL,
  printed_by_name TEXT,
  printed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.employee_letter_prints TO authenticated;
GRANT ALL ON public.employee_letter_prints TO service_role;
ALTER TABLE public.employee_letter_prints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner scope select" ON public.employee_letter_prints FOR SELECT TO authenticated USING (owner_id = public.get_team_owner_id() OR printed_by = auth.uid());
CREATE POLICY "owner scope insert" ON public.employee_letter_prints FOR INSERT TO authenticated WITH CHECK (owner_id = public.get_team_owner_id() AND printed_by = auth.uid());
CREATE INDEX idx_emp_letter_prints_emp ON public.employee_letter_prints(employee_id, printed_at DESC);
CREATE INDEX idx_emp_letter_prints_owner ON public.employee_letter_prints(owner_id, printed_at DESC);