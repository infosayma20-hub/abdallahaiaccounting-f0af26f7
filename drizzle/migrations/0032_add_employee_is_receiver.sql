ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_receiver boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employees.is_receiver IS 'موظف مستودع: يظهر له زر/شاشة استلام البضاعة بالباركود في بوابة الموظف';

CREATE INDEX IF NOT EXISTS idx_employees_is_receiver ON public.employees (user_id) WHERE is_receiver;