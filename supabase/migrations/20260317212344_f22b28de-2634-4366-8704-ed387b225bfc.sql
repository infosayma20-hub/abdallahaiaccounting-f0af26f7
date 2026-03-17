
-- Add branch_id to kitchen_stations
ALTER TABLE public.kitchen_stations 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Add branch_id to pos_printers
ALTER TABLE public.pos_printers 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
