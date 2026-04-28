
ALTER TABLE public.employee_financial_movements
  DROP CONSTRAINT IF EXISTS employee_financial_movements_source_type_check;

ALTER TABLE public.employee_financial_movements
  ADD CONSTRAINT employee_financial_movements_source_type_check
  CHECK (source_type IN (
    'hr_advance','hr_manual','pos_meal','pos_sale_credit','pos_shortage','pos_surplus',
    'finance_manual','salary_deduction','insurance','tax','system','payroll','webhook','loan_installment'
  ));
