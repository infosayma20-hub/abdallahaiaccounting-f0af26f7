
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id UUID;
  trial_plan_id UUID;
  v_is_employee BOOLEAN;
BEGIN
  -- Check if this user was created as an employee (via create-employee-account edge function)
  v_is_employee := COALESCE(NEW.raw_user_meta_data->>'role', '') = 'employee';

  -- Create profile
  INSERT INTO public.profiles (user_id, display_name, company_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركتي'),
    CASE WHEN v_is_employee THEN 'employee' ELSE 'admin' END
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Only create company, admin role, and subscription for NON-employee users
  IF NOT v_is_employee THEN
    -- Create company
    new_company_id := gen_random_uuid();
    INSERT INTO public.companies (id, name, owner_id)
    VALUES (
      new_company_id,
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركتي'),
      NEW.id
    );

    -- Link company to profile
    UPDATE public.profiles 
    SET company_id = new_company_id
    WHERE user_id = NEW.id;

    -- Assign admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Create trial subscription
    SELECT id INTO trial_plan_id FROM public.plans WHERE plan_key = 'starter' LIMIT 1;
    IF trial_plan_id IS NULL THEN
      SELECT id INTO trial_plan_id FROM public.plans ORDER BY monthly_price ASC LIMIT 1;
    END IF;
    
    IF trial_plan_id IS NOT NULL THEN
      INSERT INTO public.subscriptions (user_id, plan_id, billing_cycle, status, trial_ends_at, current_period_start, current_period_end)
      VALUES (NEW.id, trial_plan_id, 'monthly', 'trial', now() + INTERVAL '14 days', now(), now() + INTERVAL '14 days');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
