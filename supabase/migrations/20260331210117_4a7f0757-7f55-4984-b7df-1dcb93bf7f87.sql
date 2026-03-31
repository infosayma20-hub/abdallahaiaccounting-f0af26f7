CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip if user was created as employee or portal user (via metadata)
  IF COALESCE(
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = NEW.user_id),
    ''
  ) IN ('employee', 'portal', 'cashier', 'worker', 'hr_manager', 'accountant') THEN
    RETURN NEW;
  END IF;

  -- Also skip if user already has a portal/employee/cashier role in user_roles
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.user_id 
    AND role IN ('portal', 'employee', 'cashier', 'worker')
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$function$;