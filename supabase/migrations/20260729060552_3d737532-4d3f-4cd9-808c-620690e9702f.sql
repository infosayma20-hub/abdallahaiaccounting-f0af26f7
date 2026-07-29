-- 1) Free the old work-email link and bind the employee record to the account he actually uses
UPDATE public.employees
SET auth_user_id = 'c66bcb67-8324-4bd2-b33b-cfbfb3f8fba8'
WHERE id = '31b11883-445f-469c-ba53-25c13352244d';

-- 2) Profile becomes a tenant member, not an owner
UPDATE public.profiles
SET company_id = 'b4a221be-7b96-4952-8eb8-6ca749b46ca4',
    role = 'employee',
    invited_by = '0b08eba6-c81a-4f6c-b371-e6e324016e73',
    company_name = 'شركة مطاعم الدجاج الملكي',
    updated_at = now()
WHERE user_id = 'c66bcb67-8324-4bd2-b33b-cfbfb3f8fba8';

-- 3) Roles: employee only
DELETE FROM public.user_roles
WHERE user_id = 'c66bcb67-8324-4bd2-b33b-cfbfb3f8fba8' AND role <> 'employee';
INSERT INTO public.user_roles (user_id, role)
VALUES ('c66bcb67-8324-4bd2-b33b-cfbfb3f8fba8', 'employee')
ON CONFLICT (user_id, role) DO NOTHING;

-- 4) Remove the personal expired trial that triggered the subscriber overlay
DELETE FROM public.subscriptions
WHERE user_id = 'c66bcb67-8324-4bd2-b33b-cfbfb3f8fba8';