-- 1) Seed advance accounts for all existing users
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, is_active, nature, description_ar)
SELECT DISTINCT a.user_id, '2115', 'دفعات مقدمة من العملاء', 'خصوم', '2100', true, true, 'credit',
  'دفعات مقدمة مستلمة من العملاء بدون ربطها بفواتير محددة'
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts b
  WHERE b.user_id = a.user_id AND b.account_code = '2115'
);

INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, is_active, nature, description_ar)
SELECT DISTINCT a.user_id, '1146', 'دفعات مقدمة للموردين', 'أصول', '1100', true, true, 'debit',
  'دفعات مقدمة مدفوعة للموردين بدون ربطها بفواتير محددة'
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts b
  WHERE b.user_id = a.user_id AND b.account_code = '1146'
);

-- 2) Helper function for runtime fallback (used by code if account is missing)
CREATE OR REPLACE FUNCTION public.ensure_advance_accounts(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, is_active, nature, description_ar)
  VALUES (p_user_id, '2115', 'دفعات مقدمة من العملاء', 'خصوم', '2100', true, true, 'credit',
          'دفعات مقدمة مستلمة من العملاء بدون ربطها بفواتير محددة')
  ON CONFLICT (user_id, account_code) DO NOTHING;

  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, is_active, nature, description_ar)
  VALUES (p_user_id, '1146', 'دفعات مقدمة للموردين', 'أصول', '1100', true, true, 'debit',
          'دفعات مقدمة مدفوعة للموردين بدون ربطها بفواتير محددة')
  ON CONFLICT (user_id, account_code) DO NOTHING;
END;
$$;