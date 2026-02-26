
-- Employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  id_number TEXT,
  phone TEXT,
  email TEXT,
  photo_url TEXT,
  position TEXT,
  department TEXT,
  job_title TEXT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  salary_type TEXT NOT NULL DEFAULT 'شهري' CHECK (salary_type IN ('شهري', 'يومي', 'بالساعة')),
  base_salary NUMERIC NOT NULL DEFAULT 0,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  work_days_per_week INTEGER NOT NULL DEFAULT 6,
  work_hours_per_day NUMERIC NOT NULL DEFAULT 8,
  annual_leave_days INTEGER NOT NULL DEFAULT 14,
  sick_leave_days INTEGER NOT NULL DEFAULT 14,
  bank_name TEXT,
  bank_account TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own employees" ON public.employees FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own employees" ON public.employees FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own employees" ON public.employees FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own employees" ON public.employees FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Employee allowances (بدلات) - user-defined
CREATE TABLE public.employee_allowances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  allowance_name TEXT NOT NULL,
  allowance_type TEXT NOT NULL DEFAULT 'ثابت' CHECK (allowance_type IN ('ثابت', 'نسبة من الراتب', 'بالساعة', 'بالیوم')),
  amount NUMERIC NOT NULL DEFAULT 0,
  percentage NUMERIC DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own allowances" ON public.employee_allowances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own allowances" ON public.employee_allowances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own allowances" ON public.employee_allowances FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own allowances" ON public.employee_allowances FOR DELETE USING (auth.uid() = user_id);

-- Employee leaves (إجازات)
CREATE TABLE public.employee_leaves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('سنوية', 'مرضية', 'بدون راتب', 'أمومة', 'أبوة', 'طارئة', 'أخرى')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'معلقة' CHECK (status IN ('معلقة', 'موافق عليها', 'مرفوضة')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own leaves" ON public.employee_leaves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own leaves" ON public.employee_leaves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own leaves" ON public.employee_leaves FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own leaves" ON public.employee_leaves FOR DELETE USING (auth.uid() = user_id);

-- Employee deductions/withdrawals (مسحوبات وخصومات)
CREATE TABLE public.employee_deductions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  deduction_type TEXT NOT NULL CHECK (deduction_type IN ('سلفة', 'أكل', 'مشتريات', 'مخالفات', 'توصيل', 'عجز', 'فائض', 'غياب', 'أخرى')),
  amount NUMERIC NOT NULL DEFAULT 0,
  deduction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  is_repaid BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deductions" ON public.employee_deductions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own deductions" ON public.employee_deductions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own deductions" ON public.employee_deductions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own deductions" ON public.employee_deductions FOR DELETE USING (auth.uid() = user_id);

-- Attendance tracking (حضور وانصراف)
CREATE TABLE public.employee_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIME,
  check_out TIME,
  hours_worked NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'حاضر' CHECK (status IN ('حاضر', 'غائب', 'متأخر', 'إجازة', 'نصف يوم')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, attendance_date)
);

ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attendance" ON public.employee_attendance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own attendance" ON public.employee_attendance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own attendance" ON public.employee_attendance FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own attendance" ON public.employee_attendance FOR DELETE USING (auth.uid() = user_id);

-- Payroll records (كشوف الرواتب)
CREATE TABLE public.employee_payroll (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  total_allowances NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  total_overtime NUMERIC NOT NULL DEFAULT 0,
  net_salary NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, period_month, period_year)
);

ALTER TABLE public.employee_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own payroll" ON public.employee_payroll FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own payroll" ON public.employee_payroll FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own payroll" ON public.employee_payroll FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own payroll" ON public.employee_payroll FOR DELETE USING (auth.uid() = user_id);
