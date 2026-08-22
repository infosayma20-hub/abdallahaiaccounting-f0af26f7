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
  v_invited_by UUID;
  v_admin_company_id UUID;
BEGIN
  -- Check if this user was created as an employee:
  -- either explicitly flagged, or invited by an existing admin (team account)
  v_invited_by := NULLIF(NEW.raw_user_meta_data->>'invited_by', '')::UUID;
  v_is_employee := COALESCE(NEW.raw_user_meta_data->>'role', '') = 'employee'
                   OR v_invited_by IS NOT NULL;

  IF v_is_employee THEN
    -- Get the admin's company_id
    IF v_invited_by IS NOT NULL THEN
      SELECT company_id INTO v_admin_company_id
      FROM public.profiles
      WHERE user_id = v_invited_by;
    END IF;

    -- Create employee profile linked to admin's company
    INSERT INTO public.profiles (user_id, display_name, company_name, role, invited_by, company_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركتي'),
      'employee',
      v_invited_by,
      v_admin_company_id
    )
    ON CONFLICT (user_id) DO UPDATE SET
      invited_by = COALESCE(EXCLUDED.invited_by, profiles.invited_by),
      company_id = COALESCE(EXCLUDED.company_id, profiles.company_id),
      role = 'employee';

    -- Assign employee role ONLY
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'employee')
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSE
    -- Regular user (admin) flow
    INSERT INTO public.profiles (user_id, display_name, company_name, role)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      COALESCE(NEW.raw_user_meta_data->>'company_name', 'شركتي'),
      'admin'
    )
    ON CONFLICT (user_id) DO NOTHING;

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

EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup even if profile creation fails
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;