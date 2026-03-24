
-- Add static QR mode to branches
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS qr_mode text NOT NULL DEFAULT 'rotating';

-- Add per-employee shift definitions
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_start time DEFAULT '08:00';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS shift_end time DEFAULT '16:00';
