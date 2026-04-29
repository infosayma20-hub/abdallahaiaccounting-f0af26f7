ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_welcome_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_welcome_seen_at timestamptz;