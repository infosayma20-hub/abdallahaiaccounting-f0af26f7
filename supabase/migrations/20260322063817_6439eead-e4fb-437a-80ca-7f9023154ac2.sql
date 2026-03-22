
-- Remove admin role from portal user mosab@malaky.com
DELETE FROM public.user_roles 
WHERE user_id = 'db8032b4-482e-4d75-b8f7-67956e26c50e' AND role = 'admin';

-- Update trigger to NOT assign admin role to portal/employee users
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip if user was created as employee or portal user
  IF COALESCE(
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = NEW.user_id),
    ''
  ) IN ('employee', 'portal') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$function$;
