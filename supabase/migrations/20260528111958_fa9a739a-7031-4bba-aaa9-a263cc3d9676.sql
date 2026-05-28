CREATE OR REPLACE FUNCTION public.get_tenant_company_logo()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  emp_company_id uuid;
  result text;
BEGIN
  owner_id := public.get_team_owner_id();
  IF owner_id IS NULL THEN
    owner_id := auth.uid();
  END IF;

  SELECT NULLIF(cs.logo_url, '') INTO result
  FROM public.company_settings cs
  WHERE cs.user_id = owner_id
  LIMIT 1;

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  SELECT e.company_id INTO emp_company_id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
  LIMIT 1;

  IF emp_company_id IS NOT NULL THEN
    SELECT NULLIF(c.logo_url, '') INTO result
    FROM public.companies c
    WHERE c.id = emp_company_id
    LIMIT 1;
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_company_logo() TO authenticated;