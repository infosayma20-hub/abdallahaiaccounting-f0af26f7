
UPDATE public.companies 
SET logo_url = 'https://omwuyscprzexgmxgittp.supabase.co/storage/v1/object/public/company-assets/palsika-logo.png'
WHERE owner_id = (SELECT id FROM auth.users WHERE email = 'k.malhis@outlook.com' LIMIT 1);
