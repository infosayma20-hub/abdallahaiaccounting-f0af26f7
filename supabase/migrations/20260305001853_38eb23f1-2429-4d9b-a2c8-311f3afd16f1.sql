
-- Clean up: Remove 'employee' role from cashier-only users (Sondos Harb 2 & LeCadeau POS)
DELETE FROM public.user_roles 
WHERE role = 'employee' 
AND user_id IN ('2b2ce49f-0e97-4610-ba9c-4856c12b3655', 'fa276105-956e-4796-89c2-5c9440c6d6b9');

-- Clean up: Remove erroneous 'cashier' role from admin user (Abdallah Sayma)
DELETE FROM public.user_roles 
WHERE role = 'cashier' 
AND user_id = '910529c4-187e-47bd-a6a7-013320908cfd';

-- Update profiles to reflect correct role
UPDATE public.profiles SET role = 'cashier' 
WHERE user_id IN ('2b2ce49f-0e97-4610-ba9c-4856c12b3655', 'fa276105-956e-4796-89c2-5c9440c6d6b9');
