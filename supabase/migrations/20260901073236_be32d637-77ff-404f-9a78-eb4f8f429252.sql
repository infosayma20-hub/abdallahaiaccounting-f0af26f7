ALTER TABLE public.products ALTER COLUMN color DROP DEFAULT;

UPDATE public.products SET color = NULL WHERE color = '#3B82F6';

UPDATE public.products SET pos_tile_color = NULL WHERE pos_tile_color = '#3B82F6';