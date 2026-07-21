
-- =========================================================================
-- Phase 1: FX Gain/Loss Accounts Foundation (safe, additive only)
-- =========================================================================

-- 1) Add company_settings reference columns
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS fx_gain_account_code text,
  ADD COLUMN IF NOT EXISTS fx_loss_account_code text;

COMMENT ON COLUMN public.company_settings.fx_gain_account_code IS
  'الحساب الافتراضي لأرباح فروقات العملة (عادةً 4930).';
COMMENT ON COLUMN public.company_settings.fx_loss_account_code IS
  'الحساب الافتراضي لخسائر فروقات العملة (5930 إذا كان مخصصاً لذلك، أو 5940).';

-- 2) Ensure 4930 (FX Gain, revenue) exists for every tenant that has a chart of accounts
INSERT INTO public.accounts (
  user_id, account_code, account_name, account_type,
  parent_code, nature, is_system, is_system_protected, system_role, is_active
)
SELECT DISTINCT
  a.user_id,
  '4930',
  'أرباح فروقات عملة',
  'إيرادات',
  NULL,
  'credit',
  true,
  true,
  'fx_gain',
  true
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a2
  WHERE a2.user_id = a.user_id AND a2.account_code = '4930'
);

-- 3) For tenants whose existing 5930 is NOT dedicated to FX (i.e. donations),
--    create a dedicated 5940 - خسائر فروقات عملة
INSERT INTO public.accounts (
  user_id, account_code, account_name, account_type,
  parent_code, nature, is_system, is_system_protected, system_role, is_active
)
SELECT DISTINCT
  a.user_id,
  '5940',
  'خسائر فروقات عملة',
  'مصاريف',
  NULL,
  'debit',
  true,
  true,
  'fx_loss',
  true
FROM public.accounts a
WHERE
  -- has a 5930 but it's NOT already used as FX losses
  EXISTS (
    SELECT 1 FROM public.accounts a2
    WHERE a2.user_id = a.user_id
      AND a2.account_code = '5930'
      AND a2.account_name NOT ILIKE '%فروق%'
      AND a2.account_name NOT ILIKE '%عمل%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a3
    WHERE a3.user_id = a.user_id AND a3.account_code = '5940'
  );

-- 4) Tag existing 5930 that IS "فروقات عملة" with the system_role so it's discoverable
UPDATE public.accounts
SET system_role = 'fx_loss',
    is_system_protected = true
WHERE account_code = '5930'
  AND (account_name ILIKE '%فروق%' OR account_name ILIKE '%فرق%عمل%')
  AND (system_role IS NULL OR system_role = '');

-- 5) Populate company_settings defaults per tenant
UPDATE public.company_settings cs
SET fx_gain_account_code = COALESCE(cs.fx_gain_account_code, '4930')
WHERE cs.fx_gain_account_code IS NULL;

UPDATE public.company_settings cs
SET fx_loss_account_code = COALESCE(
  cs.fx_loss_account_code,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.user_id = cs.user_id
        AND a.account_code = '5930'
        AND (a.account_name ILIKE '%فروق%' OR a.account_name ILIKE '%فرق%عمل%')
    ) THEN '5930'
    WHEN EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.user_id = cs.user_id AND a.account_code = '5940'
    ) THEN '5940'
    ELSE '5930'
  END
)
WHERE cs.fx_loss_account_code IS NULL;
