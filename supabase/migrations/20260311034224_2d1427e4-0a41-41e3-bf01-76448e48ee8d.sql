
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS pos_day_cutoff_hour integer DEFAULT 6;

COMMENT ON COLUMN public.company_settings.pos_day_cutoff_hour IS 'Hour (0-23) before which the POS accounting date rolls back to previous day. Default 6 means shifts opened before 6AM count as previous day.';
