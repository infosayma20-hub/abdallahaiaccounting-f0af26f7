-- منح صلاحية السوبر ادمن لـ info.sayma20@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users WHERE email = 'info.sayma20@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;