DELETE FROM public.user_roles
WHERE user_id = '65e3ed73-36a0-4487-80d9-6390ae8288da'::uuid
  AND role = 'admin'::app_role;

UPDATE public.hr_manager_permissions
SET can_view_complaints = false,
    can_view_executive_complaints = false
WHERE hr_auth_id = '65e3ed73-36a0-4487-80d9-6390ae8288da'::uuid;