
-- Central employee financial movements table
CREATE TABLE public.employee_financial_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  
  source_type TEXT NOT NULL CHECK (source_type IN (
    'hr_advance', 'pos_meal', 'pos_sale_credit', 'pos_shortage',
    'finance_manual', 'salary_deduction', 'insurance', 'tax'
  )),
  
  source_id UUID,
  source_reference TEXT,
  
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('debit', 'credit')),
  
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'deducted'
  )),
  
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  salary_month INTEGER CHECK (salary_month BETWEEN 1 AND 12),
  salary_year INTEGER,
  
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  
  journal_entry_id UUID,
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.employee_financial_movements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their employee movements"
ON public.employee_financial_movements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert employee movements"
ON public.employee_financial_movements FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their employee movements"
ON public.employee_financial_movements FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their employee movements"
ON public.employee_financial_movements FOR DELETE
USING (auth.uid() = user_id);

-- Index for common queries
CREATE INDEX idx_efm_employee_month ON public.employee_financial_movements(employee_id, salary_year, salary_month);
CREATE INDEX idx_efm_user_id ON public.employee_financial_movements(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_efm_updated_at
BEFORE UPDATE ON public.employee_financial_movements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
