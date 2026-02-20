-- Change category column from enum to text to allow custom categories
ALTER TABLE public.products 
  ALTER COLUMN category TYPE text 
  USING category::text;

-- Keep the default value
ALTER TABLE public.products 
  ALTER COLUMN category SET DEFAULT 'بضاعة عامة';
