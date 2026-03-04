
-- ━━━ 1. Add new columns to employees ━━━
ALTER TABLE public.employees 
  ADD COLUMN IF NOT EXISTS marital_status TEXT DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spouse_allowance_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS child_allowance_per_child NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_leave_balance NUMERIC(5,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_year_balance NUMERIC(5,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_id UUID,
  ADD COLUMN IF NOT EXISTS is_terminated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminated_at DATE,
  ADD COLUMN IF NOT EXISTS termination_reason TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'male',
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'permanent',
  ADD COLUMN IF NOT EXISTS transportation_allowance_per_day NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_allowance_per_day NUMERIC(10,2) DEFAULT 0;

-- ━━━ 2. Work Shifts table ━━━
CREATE TABLE IF NOT EXISTS public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '16:00',
  break_duration_minutes INTEGER DEFAULT 30,
  days_of_week INTEGER[] DEFAULT ARRAY[0,1,2,3,4,5],
  late_tolerance_minutes INTEGER DEFAULT 15,
  overtime_after_minutes INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shifts" ON public.work_shifts FOR ALL USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

-- Link employees to shifts
ALTER TABLE public.employees ADD CONSTRAINT employees_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.work_shifts(id) ON DELETE SET NULL;

-- ━━━ 3. Official Holidays table ━━━
CREATE TABLE IF NOT EXISTS public.official_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  multiplier NUMERIC(3,1) DEFAULT 2.0,
  is_recurring BOOLEAN DEFAULT false,
  recurring_month INTEGER,
  recurring_day INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.official_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own holidays" ON public.official_holidays FOR ALL USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

-- ━━━ 4. Leave Requests table (enhanced) ━━━
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL DEFAULT 'annual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(5,1) DEFAULT 1,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  review_notes TEXT,
  temporary_exit_hours NUMERIC(4,1),
  temporary_exit_return_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT leave_requests_type_check CHECK (leave_type IN ('annual','sick','emergency','maternity','paternity','unpaid','temporary_exit'))
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own leave_requests" ON public.leave_requests FOR ALL USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

-- ━━━ 5. Salary Slips table ━━━
CREATE TABLE IF NOT EXISTS public.salary_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  
  -- Days breakdown
  work_days INTEGER DEFAULT 0,
  present_days INTEGER DEFAULT 0,
  annual_leave_days NUMERIC(5,1) DEFAULT 0,
  sick_leave_days NUMERIC(5,1) DEFAULT 0,
  official_holiday_days INTEGER DEFAULT 0,
  weekly_days_off INTEGER DEFAULT 0,
  total_paid_days NUMERIC(5,1) DEFAULT 0,
  absent_days NUMERIC(5,1) DEFAULT 0,
  
  -- Earnings
  basic_salary NUMERIC(10,2) DEFAULT 0,
  transportation_allowance NUMERIC(10,2) DEFAULT 0,
  meal_allowance NUMERIC(10,2) DEFAULT 0,
  spouse_allowance NUMERIC(10,2) DEFAULT 0,
  children_allowance NUMERIC(10,2) DEFAULT 0,
  overtime_amount NUMERIC(10,2) DEFAULT 0,
  other_allowances NUMERIC(10,2) DEFAULT 0,
  total_earnings NUMERIC(10,2) DEFAULT 0,
  
  -- Deductions
  absence_deduction NUMERIC(10,2) DEFAULT 0,
  late_deduction NUMERIC(10,2) DEFAULT 0,
  advance_deduction NUMERIC(10,2) DEFAULT 0,
  social_insurance NUMERIC(10,2) DEFAULT 0,
  other_deductions NUMERIC(10,2) DEFAULT 0,
  total_deductions NUMERIC(10,2) DEFAULT 0,
  
  net_salary NUMERIC(10,2) DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(employee_id, period_month, period_year)
);

ALTER TABLE public.salary_slips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own salary_slips" ON public.salary_slips FOR ALL USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

-- ━━━ 6. Termination Records table ━━━
CREATE TABLE IF NOT EXISTS public.termination_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  termination_date DATE NOT NULL,
  termination_reason TEXT,
  years_worked NUMERIC(5,2) DEFAULT 0,
  
  severance_pay NUMERIC(10,2) DEFAULT 0,
  unused_leave_pay NUMERIC(10,2) DEFAULT 0,
  current_month_salary NUMERIC(10,2) DEFAULT 0,
  advance_balance NUMERIC(10,2) DEFAULT 0,
  other_deductions NUMERIC(10,2) DEFAULT 0,
  total_dues NUMERIC(10,2) DEFAULT 0,
  
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.termination_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own termination_records" ON public.termination_records FOR ALL USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), user_id));

-- ━━━ 7. Update employee_allowances table ━━━
-- Drop old columns and add new structure
ALTER TABLE public.employee_allowances 
  ADD COLUMN IF NOT EXISTS amount_per_day NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_months INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_date DATE;

-- Update allowance_type check if exists
ALTER TABLE public.employee_allowances DROP CONSTRAINT IF EXISTS employee_allowances_allowance_type_check;
