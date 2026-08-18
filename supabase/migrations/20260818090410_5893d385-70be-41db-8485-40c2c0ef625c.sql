-- 1) Tag existing purchase-side contra accounts with their canonical system_role
UPDATE public.accounts
SET system_role = 'purchase_returns', nature = 'credit', is_contra = true, updated_at = now()
WHERE (account_name IN ('مردودات ومسموحات مشتريات', 'مردودات المشتريات'))
  AND (system_role IS NULL OR system_role = '')
  AND account_code LIKE '5%';

UPDATE public.accounts
SET system_role = 'purchase_discounts', nature = 'credit', is_contra = true, updated_at = now()
WHERE account_name IN ('خصم المشتريات المكتسب', 'خصم مكتسب')
  AND (system_role IS NULL OR system_role = '');

-- 2) Seed "مردودات ومسموحات المشتريات" (5120) for tenants that don't have one
INSERT INTO public.accounts
  (user_id, account_code, account_name, account_type, parent_code, nature, is_contra,
   system_role, is_system, display_order, description_ar, sub_group_label)
SELECT p.user_id, '5120', 'مردودات ومسموحات المشتريات', 'مشتريات', '5100', 'credit', true,
       'purchase_returns', true, 120,
       'البضاعة المرتجعة للمورد أو المسموحات — حساب مقابل يُخصم من المشتريات',
       'تكلفة المبيعات'
FROM (SELECT DISTINCT user_id FROM public.accounts WHERE account_code = '5100') p
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = p.user_id AND a.system_role = 'purchase_returns')
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = p.user_id AND a.account_code = '5120');

-- 3) Seed "خصم المشتريات المكتسب" (5130) for tenants that don't have one
INSERT INTO public.accounts
  (user_id, account_code, account_name, account_type, parent_code, nature, is_contra,
   system_role, is_system, display_order, description_ar, sub_group_label)
SELECT p.user_id, '5130', 'خصم المشتريات المكتسب', 'مشتريات', '5100', 'credit', true,
       'purchase_discounts', true, 130,
       'الخصم الممنوح من المورد بعد الشراء — حساب مقابل يُخصم من تكلفة المشتريات',
       'تكلفة المبيعات'
FROM (SELECT DISTINCT user_id FROM public.accounts WHERE account_code = '5100') p
WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = p.user_id AND a.system_role = 'purchase_discounts')
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = p.user_id AND a.account_code = '5130');