ALTER TABLE public.company_settings 
  ADD COLUMN IF NOT EXISTS hr_show_policies boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS hr_show_loan_form boolean DEFAULT true;

-- Disable for saymehosaid@gmail.com
UPDATE public.company_settings 
SET hr_show_policies = false, hr_show_loan_form = false
WHERE user_id = 'f095ae37-960c-4de7-8da1-b68cebf0bb50';