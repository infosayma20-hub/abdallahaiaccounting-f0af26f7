
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS pos_require_device_fingerprint BOOLEAN DEFAULT false;

ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS pos_allow_order_transfer BOOLEAN DEFAULT false;
