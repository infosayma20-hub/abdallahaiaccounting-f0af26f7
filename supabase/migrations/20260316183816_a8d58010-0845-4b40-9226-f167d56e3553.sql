
-- Main loan table
CREATE TABLE IF NOT EXISTS public.employee_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  total_amount decimal NOT NULL,
  monthly_installment decimal NOT NULL,
  total_months int NOT NULL,
  paid_months int DEFAULT 0,
  remaining_amount decimal NOT NULL,
  first_payment_date date NOT NULL,
  last_payment_date date NOT NULL,
  status varchar DEFAULT 'active',
  approved_by varchar,
  approval_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Installment schedule table
CREATE TABLE IF NOT EXISTS public.loan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid,
  employee_id uuid NOT NULL,
  month_number int NOT NULL,
  due_date date NOT NULL,
  installment_amount decimal NOT NULL,
  balance_after decimal NOT NULL,
  status varchar DEFAULT 'pending',
  paid_date date,
  payroll_month int,
  payroll_year int,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their loans" ON public.employee_loans
  FOR ALL USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Users can manage their installments" ON public.loan_installments
  FOR ALL USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));
