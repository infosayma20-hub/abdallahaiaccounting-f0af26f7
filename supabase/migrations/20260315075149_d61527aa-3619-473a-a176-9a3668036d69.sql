ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS pos_return_policy_days integer DEFAULT 7,
ADD COLUMN IF NOT EXISTS pos_show_return_policy boolean DEFAULT true;