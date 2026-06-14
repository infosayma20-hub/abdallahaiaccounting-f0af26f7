ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS auth_disabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS auth_disabled_at TIMESTAMPTZ;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS auth_disabled_by UUID;