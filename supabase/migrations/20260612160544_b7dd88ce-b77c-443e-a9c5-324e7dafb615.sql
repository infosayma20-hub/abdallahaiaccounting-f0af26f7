ALTER TABLE public.employee_payroll DISABLE TRIGGER trg_guard_employee_payroll_locked;
UPDATE public.employee_payroll
SET net_salary = 4107.78
WHERE period_month = 5 AND period_year = 2026
  AND employee_id = 'dcb4c2a0-49d5-4a73-ab53-f556a5c11df9';
ALTER TABLE public.employee_payroll ENABLE TRIGGER trg_guard_employee_payroll_locked;