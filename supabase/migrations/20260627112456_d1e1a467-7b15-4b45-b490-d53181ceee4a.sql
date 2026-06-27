CREATE OR REPLACE FUNCTION public.save_onboarding_progress(
  _user_id uuid,
  _company_name text DEFAULT NULL,
  _profile jsonb DEFAULT '{}'::jsonb,
  _target_step integer DEFAULT NULL,
  _mark_completed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_owner_id uuid;
  v_company_id uuid;
  v_existing_company_name text;
  v_accounts_count integer := 0;
  v_step integer := GREATEST(1, LEAST(COALESCE(_target_step, 1), 5));
  v_profile jsonb := COALESCE(_profile, '{}'::jsonb);
BEGIN
  IF _user_id IS NULL OR v_auth_uid IS NULL OR v_auth_uid <> _user_id THEN
    RAISE EXCEPTION 'forbidden_onboarding_user' USING ERRCODE = '42501';
  END IF;

  v_owner_id := COALESCE(public.get_team_owner_id(_user_id), _user_id);

  -- The onboarding wizard creates/owns tenant bootstrap data. Team members must
  -- not complete it on behalf of the owner; they are routed by role guards.
  IF v_owner_id <> _user_id THEN
    RAISE EXCEPTION 'onboarding_owner_only' USING ERRCODE = '42501';
  END IF;

  SELECT c.id, c.name
    INTO v_company_id, v_existing_company_name
  FROM public.companies c
  WHERE c.owner_id = v_owner_id
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (owner_id, name)
    VALUES (v_owner_id, COALESCE(NULLIF(BTRIM(_company_name), ''), 'شركتي'))
    RETURNING id INTO v_company_id;
  ELSIF NULLIF(BTRIM(_company_name), '') IS NOT NULL THEN
    UPDATE public.companies
       SET name = BTRIM(_company_name),
           updated_at = now()
     WHERE id = v_company_id;
  END IF;

  SELECT count(*)::integer
    INTO v_accounts_count
  FROM public.accounts a
  WHERE a.user_id = v_owner_id;

  IF _mark_completed AND v_accounts_count = 0 THEN
    RAISE EXCEPTION 'onboarding_accounts_missing' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.company_profiles (
    company_id,
    business_type,
    industry,
    industry_ar,
    city,
    country,
    has_employees,
    employees_count,
    annual_revenue,
    primary_currency,
    accounting_experience,
    referral_source,
    business_goals,
    onboarding_completed,
    onboarding_step
  ) VALUES (
    v_company_id,
    v_profile->>'business_type',
    v_profile->>'industry',
    v_profile->>'industry_ar',
    v_profile->>'city',
    COALESCE(v_profile->>'country', 'PS'),
    CASE WHEN v_profile ? 'has_employees' THEN (v_profile->>'has_employees')::boolean ELSE NULL END,
    v_profile->>'employees_count',
    v_profile->>'annual_revenue',
    COALESCE(v_profile->>'primary_currency', 'ILS'),
    v_profile->>'accounting_experience',
    v_profile->>'referral_source',
    CASE WHEN jsonb_typeof(v_profile->'business_goals') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_profile->'business_goals'))
      ELSE NULL
    END,
    COALESCE(_mark_completed, false),
    v_step
  )
  ON CONFLICT (company_id) DO UPDATE SET
    business_type = COALESCE(EXCLUDED.business_type, public.company_profiles.business_type),
    industry = COALESCE(EXCLUDED.industry, public.company_profiles.industry),
    industry_ar = COALESCE(EXCLUDED.industry_ar, public.company_profiles.industry_ar),
    city = COALESCE(EXCLUDED.city, public.company_profiles.city),
    country = COALESCE(EXCLUDED.country, public.company_profiles.country),
    has_employees = COALESCE(EXCLUDED.has_employees, public.company_profiles.has_employees),
    employees_count = COALESCE(EXCLUDED.employees_count, public.company_profiles.employees_count),
    annual_revenue = COALESCE(EXCLUDED.annual_revenue, public.company_profiles.annual_revenue),
    primary_currency = COALESCE(EXCLUDED.primary_currency, public.company_profiles.primary_currency),
    accounting_experience = COALESCE(EXCLUDED.accounting_experience, public.company_profiles.accounting_experience),
    referral_source = COALESCE(EXCLUDED.referral_source, public.company_profiles.referral_source),
    business_goals = COALESCE(EXCLUDED.business_goals, public.company_profiles.business_goals),
    onboarding_completed = CASE WHEN _mark_completed THEN true ELSE public.company_profiles.onboarding_completed END,
    onboarding_step = GREATEST(COALESCE(public.company_profiles.onboarding_step, 1), v_step);

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'onboarding_step', v_step,
    'onboarding_completed', _mark_completed,
    'accounts_count', v_accounts_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(uuid, text, jsonb, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress(uuid, text, jsonb, integer, boolean) TO service_role;