-- Add Malaki-specific columns to employees table
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS admin_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_transport_override numeric,
  ADD COLUMN IF NOT EXISTS wives_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_work_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Create monthly payroll inputs table
CREATE TABLE IF NOT EXISTS public.monthly_payroll_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  working_days integer DEFAULT 0,
  working_hours numeric DEFAULT 0,
  overtime_hours numeric DEFAULT 0,
  holiday_overtime_hours numeric DEFAULT 0,
  vacation_hours numeric DEFAULT 0,
  annual_leave_days numeric DEFAULT 0,
  sick_leave_days numeric DEFAULT 0,
  opening_advance_balance numeric DEFAULT 0,
  loan_installment numeric DEFAULT 0,
  new_advance numeric DEFAULT 0,
  cash_advances numeric DEFAULT 0,
  food_total numeric DEFAULT 0,
  food_individual numeric DEFAULT 0,
  cash_shortage numeric DEFAULT 0,
  cash_surplus numeric DEFAULT 0,
  delivery numeric DEFAULT 0,
  purchases numeric DEFAULT 0,
  other_deduction numeric DEFAULT 0,
  violations numeric DEFAULT 0,
  deduction_notes text,
  special_allowance numeric DEFAULT 0,
  extra_work_allowance numeric DEFAULT 0,
  has_termination_pay boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, year, month)
);

-- Add detailed columns to employee_payroll for Malaki payslip
ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS attendance_salary numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regular_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours_val numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_hours_paid numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS food_transport_net numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS family_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances_val numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_bonus numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_work_allowance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entitlements numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_opening_balance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_loan numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_new_advance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_cash_advance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_food_group numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_food_individual numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_cash_shortage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_delivery numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_purchases numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_other numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_violations numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_fixed_component numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carry_over_balance numeric DEFAULT 0;

-- Enable RLS on monthly_payroll_inputs
ALTER TABLE public.monthly_payroll_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their payroll inputs" ON public.monthly_payroll_inputs
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid() 
    OR company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR company_id IN (SELECT id FROM public.companies WHERE owner_id = auth.uid())
    OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );