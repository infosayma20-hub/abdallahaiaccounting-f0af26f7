ALTER TABLE public.company_settings ALTER COLUMN pos_tables_enabled DROP NOT NULL;
ALTER TABLE public.company_settings ALTER COLUMN pos_call_center_enabled DROP NOT NULL;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS pos_kiosk_enabled boolean;