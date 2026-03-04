
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.pos_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Initialize sort_order for existing pos_categories based on display_order
UPDATE public.pos_categories SET sort_order = display_order WHERE sort_order = 0;
