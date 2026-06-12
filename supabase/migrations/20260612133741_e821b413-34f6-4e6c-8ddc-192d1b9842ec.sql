ALTER TABLE public.employee_payroll
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_month_salary_advance NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.employee_payroll.settlement_amount IS 'مخالصة ومستحقات نهاية الخدمة أو بنود استحقاق غير دورية';
COMMENT ON COLUMN public.employee_payroll.next_month_salary_advance IS 'راتب الشهر القادم مدفوع مقدماً ضمن هذا الكشف';