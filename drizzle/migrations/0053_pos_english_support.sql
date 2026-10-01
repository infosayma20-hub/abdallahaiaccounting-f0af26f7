ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.pos_categories ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS receipt_language text NOT NULL DEFAULT 'ar';
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS address_en text;
COMMENT ON COLUMN public.branches.receipt_language IS 'Printed receipt language: ar | en';