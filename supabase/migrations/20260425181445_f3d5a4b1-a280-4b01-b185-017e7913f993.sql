-- Add employee_id column to link sales_representatives to employees
ALTER TABLE public.sales_representatives
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_representatives_employee_id
  ON public.sales_representatives(employee_id);

-- Backfill: link existing reps to employees via auth_user_id when possible
UPDATE public.sales_representatives sr
SET employee_id = e.id
FROM public.employees e
WHERE sr.employee_id IS NULL
  AND sr.auth_user_id IS NOT NULL
  AND e.auth_user_id = sr.auth_user_id
  AND e.user_id = sr.user_id;