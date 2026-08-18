-- Tag sales contra accounts (leaf accounts only) per tenant
WITH leaf AS (
  SELECT a.* FROM public.accounts a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts c WHERE c.user_id = a.user_id AND c.parent_code = a.account_code
  )
),
returns_pick AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM leaf
  WHERE (account_code IN ('4400','4150') OR account_code LIKE '4400-%')
    AND account_name ILIKE '%مردودات%'
  ORDER BY user_id,
    CASE WHEN account_code = '4400' THEN 0
         WHEN account_code = '4150' THEN 1
         WHEN account_name = 'مردودات المبيعات' THEN 2
         ELSE 3 END,
    account_code
),
discounts_pick AS (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM leaf
  WHERE account_code = '4500' AND account_name ILIKE '%خصم%'
  ORDER BY user_id, account_code
)
UPDATE public.accounts a
SET system_role = v.role
FROM (
  SELECT id, 'sales_returns'::text AS role FROM returns_pick
  UNION ALL
  SELECT id, 'sales_discounts'::text FROM discounts_pick
) v
WHERE a.id = v.id
  AND (a.system_role IS NULL OR a.system_role = '');