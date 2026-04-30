ALTER TABLE public.employee_payroll
ADD COLUMN IF NOT EXISTS approval_snapshot JSONB;

COMMENT ON COLUMN public.employee_payroll.approval_snapshot IS
'Frozen snapshot of payroll values at the moment of approval. Includes net_salary, total_allowances, total_deductions, working_days, regular_hours, overtime_hours_val, attendance_salary, and approver info. Once approved, this snapshot is immutable and is the source of truth for payment regardless of subsequent attendance/data changes.';