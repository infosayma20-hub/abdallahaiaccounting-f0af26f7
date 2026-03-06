
ALTER TABLE public.contractor_projects
  ADD COLUMN phone TEXT,
  ADD COLUMN address TEXT,
  ADD COLUMN execution_duration TEXT,
  ADD COLUMN payment_terms TEXT,
  ADD COLUMN tasks TEXT[] DEFAULT '{}';
