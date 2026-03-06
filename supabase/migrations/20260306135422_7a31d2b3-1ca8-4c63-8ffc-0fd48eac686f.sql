
-- Add parent account "1180 - ذمم موظفين" for all users who have accounts set up
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, is_system, is_active, parent_code)
SELECT DISTINCT user_id, '1180', 'ذمم موظفين', 'أصول', true, true, null
FROM public.accounts
WHERE account_code = '1130'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a2 
    WHERE a2.user_id = accounts.user_id AND a2.account_code = '1180'
  );
