ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_company_is_demo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_demo IS DISTINCT FROM COALESCE(OLD.is_demo, false)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'only super_admin can change demo mode';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_company_is_demo ON public.companies;
CREATE TRIGGER trg_guard_company_is_demo BEFORE INSERT OR UPDATE OF is_demo ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.guard_company_is_demo();

CREATE OR REPLACE FUNCTION public.is_current_tenant_demo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT bool_or(c.is_demo) FROM public.companies c
                   WHERE c.owner_id = public.get_team_owner_id()), false)
$$;
GRANT EXECUTE ON FUNCTION public.is_current_tenant_demo() TO authenticated;