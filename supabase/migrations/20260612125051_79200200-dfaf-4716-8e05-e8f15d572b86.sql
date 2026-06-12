
ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS working_hours numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_leave_days_taken numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_leave_days numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_work_allowance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surplus_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_id uuid NULL REFERENCES public.branches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employee_payroll.working_hours IS 'إجمالي ساعات العمل بالشهر (للعرض في القسيمة)';
COMMENT ON COLUMN public.employee_payroll.annual_leave_days_taken IS 'عدد أيام الإجازة السنوية المأخوذة في هذا الشهر';
COMMENT ON COLUMN public.employee_payroll.sick_leave_days IS 'عدد أيام الإجازة المرضية في هذا الشهر';
COMMENT ON COLUMN public.employee_payroll.vacation_work_allowance IS 'بدل دوام إجازات (عند العمل في إجازة رسمية)';
COMMENT ON COLUMN public.employee_payroll.surplus_amount IS 'فائض صندوق (يُضاف للموظف)';
COMMENT ON COLUMN public.employee_payroll.branch_id IS 'لقطة فرع الموظف وقت إصدار القسيمة';

CREATE INDEX IF NOT EXISTS idx_employee_payroll_branch ON public.employee_payroll(branch_id) WHERE branch_id IS NOT NULL;
