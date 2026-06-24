ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS pos_tables_enabled boolean NOT NULL DEFAULT true;
UPDATE public.company_settings SET pos_tables_enabled = false WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73';
INSERT INTO public.company_settings (user_id, pos_tables_enabled)
SELECT '0b08eba6-c81a-4f6c-b371-e6e324016e73', false
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73');