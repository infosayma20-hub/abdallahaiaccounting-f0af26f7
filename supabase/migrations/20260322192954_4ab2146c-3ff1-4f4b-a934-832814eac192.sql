
ALTER TABLE public.pos_users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
