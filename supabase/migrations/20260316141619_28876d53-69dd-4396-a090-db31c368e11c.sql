
-- Employee Advances (سلف وقروض)
CREATE TABLE public.employee_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  advance_type text NOT NULL DEFAULT 'سلفة_راتب',
  amount decimal NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  approved_date date,
  payment_date date,
  payment_method text DEFAULT 'نقداً',
  installments_count int NOT NULL DEFAULT 1,
  installment_amount decimal,
  start_deduction_month date,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Employee Advance Installments (أقساط)
CREATE TABLE public.employee_advance_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.employee_advances(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  installment_number int NOT NULL,
  due_month date NOT NULL,
  amount decimal NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payslip_id uuid,
  deducted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Employee HR Records (أداء، إنذارات، مكافآت)
CREATE TABLE public.employee_hr_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  title text,
  description text,
  rating int,
  amount decimal,
  action_taken text,
  period text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add deduction_month to employee_deductions
ALTER TABLE public.employee_deductions 
  ADD COLUMN IF NOT EXISTS deduction_month date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'معتمد للخصم';

-- RLS
ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_advance_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_hr_records ENABLE ROW LEVEL SECURITY;

-- Policies for employee_advances
CREATE POLICY "Users can manage own advances" ON public.employee_advances
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Policies for employee_advance_installments
CREATE POLICY "Users can manage own installments" ON public.employee_advance_installments
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Policies for employee_hr_records
CREATE POLICY "Users can manage own hr records" ON public.employee_hr_records
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));
