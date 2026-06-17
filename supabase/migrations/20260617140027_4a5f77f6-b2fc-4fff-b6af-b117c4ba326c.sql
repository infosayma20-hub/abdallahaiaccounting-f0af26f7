
-- Repair mohammadsaadeh@malaky.com (61477299-...) who was created before
-- the create-employee-account function set role:'employee' metadata, so
-- handle_new_user() ran the admin branch and gave him admin role + a
-- standalone company + trial subscription. Result: he landed on /apps.

DO $$
DECLARE
  v_uid uuid := '61477299-80dd-40d0-a86b-94330f48729b';
  v_owner uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_owner_company uuid := 'b4a221be-7b96-4952-8eb8-6ca749b46ca4';
  v_bad_company uuid := 'e6e7b233-db1c-4386-b4dd-325b08440229';
BEGIN
  -- 1. Drop admin role, ensure employee role exists
  DELETE FROM public.user_roles WHERE user_id = v_uid AND role <> 'employee';
  INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'employee')
    ON CONFLICT (user_id, role) DO NOTHING;

  -- 2. Fix profile
  UPDATE public.profiles
     SET role = 'employee',
         invited_by = COALESCE(invited_by, v_owner),
         company_id = v_owner_company
   WHERE user_id = v_uid;

  -- 3. Drop bogus trial subscription
  DELETE FROM public.subscriptions WHERE user_id = v_uid;

  -- 4. Drop bogus company (only if still owned by him and unused)
  DELETE FROM public.companies
   WHERE id = v_bad_company
     AND owner_id = v_uid;
END $$;
