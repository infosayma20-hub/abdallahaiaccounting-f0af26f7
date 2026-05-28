CREATE OR REPLACE FUNCTION public.resolve_password_reset_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record RECORD;
  owner_uid UUID;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.id, e.company_id, e.full_name, c.owner_id
    INTO emp_record
  FROM public.employees e
  LEFT JOIN public.companies c ON c.id = e.company_id
  WHERE lower(e.email) = lower(NEW.email)
  LIMIT 1;
  IF FOUND THEN
    NEW.employee_id := emp_record.id;
    -- Store TEAM OWNER user_id so RLS (company_id = get_team_owner_id(auth.uid())) matches admins/HR
    NEW.company_id := COALESCE(emp_record.owner_id, emp_record.company_id);
    IF NEW.employee_name IS NULL OR NEW.employee_name = '' THEN
      NEW.employee_name := emp_record.full_name;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Backfill existing rows so they become visible to the correct team owner
UPDATE public.password_reset_requests prr
SET company_id = c.owner_id
FROM public.companies c
WHERE prr.company_id = c.id
  AND c.owner_id IS NOT NULL
  AND prr.company_id <> c.owner_id;