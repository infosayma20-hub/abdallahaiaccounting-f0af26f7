ALTER TABLE public.compensations
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS compensation_type text,
  ADD COLUMN IF NOT EXISTS responder_name text,
  ADD COLUMN IF NOT EXISTS responder_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compensated_at timestamptz,
  ADD COLUMN IF NOT EXISTS compensated_by uuid;

COMMENT ON COLUMN public.compensations.customer_name IS 'اسم الزبون المستحق للتعويض';
COMMENT ON COLUMN public.compensations.customer_phone IS 'رقم جوال الزبون للتواصل عند صرف التعويض';
COMMENT ON COLUMN public.compensations.compensation_type IS 'نوع التعويض: مبلغ مالي / وجبة مجانية / خصم على الطلب القادم / استبدال منتج / قسيمة شرائية / أخرى';
COMMENT ON COLUMN public.compensations.responder_name IS 'اسم الموظف المستجيب للتعويض';
COMMENT ON COLUMN public.compensations.compensated_at IS 'وقت تسليم/صرف التعويض للزبون فعلياً';
COMMENT ON COLUMN public.compensations.compensated_by IS 'من سجّل تسليم التعويض';