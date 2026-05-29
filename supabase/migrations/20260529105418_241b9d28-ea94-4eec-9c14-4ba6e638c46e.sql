-- 1) Add license_number column
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS license_number TEXT;

-- 2) Function to generate unique 8-digit license numbers
CREATE OR REPLACE FUNCTION public.generate_company_license_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
  exists_already BOOLEAN;
BEGIN
  LOOP
    -- 8-digit number, first digit between 1-9 to avoid leading zero
    candidate := (FLOOR(random() * 9) + 1)::int::text ||
                 LPAD(FLOOR(random() * 10000000)::int::text, 7, '0');
    SELECT EXISTS(SELECT 1 FROM public.companies WHERE license_number = candidate)
      INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN candidate;
END;
$$;

-- 3) BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION public.set_company_license_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.license_number IS NULL OR NEW.license_number = '' THEN
    NEW.license_number := public.generate_company_license_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_company_license_number ON public.companies;
CREATE TRIGGER trg_set_company_license_number
  BEFORE INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_license_number();

-- 4) Backfill existing companies
UPDATE public.companies
SET license_number = public.generate_company_license_number()
WHERE license_number IS NULL OR license_number = '';

-- 5) Make it NOT NULL + UNIQUE after backfill
ALTER TABLE public.companies
  ALTER COLUMN license_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_license_number_unique
  ON public.companies (license_number);