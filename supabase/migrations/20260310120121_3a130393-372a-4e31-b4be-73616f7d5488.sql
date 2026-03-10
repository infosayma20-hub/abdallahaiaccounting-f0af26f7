
-- 1. Rename "كهرباء وماء" (5400) to "مصروف كهرباء" and move under 5500
UPDATE public.accounts 
SET account_name = 'مصروف كهرباء', parent_code = '5500'
WHERE account_code = '5400';

-- 2. Move "مصروف غاز" (5410) under 5500
UPDATE public.accounts 
SET parent_code = '5500'
WHERE account_code = '5410';

-- 3. Rename "مصروفات عمومية" to "مصروفات إدارية وعمومية"
UPDATE public.accounts 
SET account_name = 'مصروفات إدارية وعمومية'
WHERE account_code = '5500';

-- 4. Add "مصروف مياه" (5420) for all users who have the 5500 account but not 5420
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, is_active)
SELECT DISTINCT a.user_id, '5420', 'مصروف مياه', 'مصاريف', '5500', true, true
FROM public.accounts a
WHERE a.account_code = '5500'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts b 
    WHERE b.user_id = a.user_id AND b.account_code = '5420'
  );
