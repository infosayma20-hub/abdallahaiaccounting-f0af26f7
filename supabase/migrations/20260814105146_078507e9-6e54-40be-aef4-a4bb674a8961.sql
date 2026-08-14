ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_departure_cap_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hr_departure_cap_minutes integer NOT NULL DEFAULT 30;

UPDATE public.company_settings
SET hr_departure_cap_enabled = true,
    hr_departure_cap_minutes = 30
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73';