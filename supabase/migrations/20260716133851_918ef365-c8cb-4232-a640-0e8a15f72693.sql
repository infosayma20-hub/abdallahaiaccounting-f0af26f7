ALTER TABLE public.employee_leaves DROP CONSTRAINT IF EXISTS employee_leaves_leave_type_check;
ALTER TABLE public.employee_leaves ADD CONSTRAINT employee_leaves_leave_type_check
  CHECK (leave_type = ANY (ARRAY[
    'سنوية'::text, 'عادية'::text, 'مرضية'::text, 'بدون راتب'::text,
    'أمومة'::text, 'أبوة'::text, 'طارئة'::text, 'شخصية'::text, 'أخرى'::text
  ]));