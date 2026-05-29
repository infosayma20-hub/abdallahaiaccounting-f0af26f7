ALTER TABLE public.companies
  ALTER COLUMN license_number SET DEFAULT public.generate_company_license_number();