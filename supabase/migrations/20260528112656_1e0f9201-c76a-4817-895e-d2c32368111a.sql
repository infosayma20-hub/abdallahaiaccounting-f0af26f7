CREATE OR REPLACE FUNCTION public.get_tenant_company_logo()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  owner_id uuid;
  emp_company_id uuid;
  result text;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve tenant owner (invited_by or self)
  owner_id := public.get_team_owner_id(uid);

  -- 1) company_settings of the owner
  SELECT NULLIF(cs.logo_url, '') INTO result
  FROM public.company_settings cs
  WHERE cs.user_id = owner_id
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  -- 2) companies.logo_url for the employee's company (match auth_user_id OR user_id)
  SELECT e.company_id INTO emp_company_id
  FROM public.employees e
  WHERE e.auth_user_id = uid OR e.user_id = uid
  LIMIT 1;

  IF emp_company_id IS NOT NULL THEN
    SELECT NULLIF(c.logo_url, '') INTO result
    FROM public.companies c
    WHERE c.id = emp_company_id
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  -- 3) companies owned by the tenant owner
  SELECT NULLIF(c.logo_url, '') INTO result
  FROM public.companies c
  WHERE c.owner_id = owner_id
  LIMIT 1;

  RETURN result;
END;
$function$;