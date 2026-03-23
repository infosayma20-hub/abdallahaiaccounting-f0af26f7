
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS pos_kitchen_ticket_size text DEFAULT '58mm',
ADD COLUMN IF NOT EXISTS pos_kitchen_auto_print boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS print_decorative_ornaments boolean DEFAULT false;
