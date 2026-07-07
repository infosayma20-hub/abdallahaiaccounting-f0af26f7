
-- =========================================================================
-- A) Helper function: create a new leaf account under a given parent
--    Used by app (BankAccountsPage) and by the backfill below.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_bank_leaf_account(
  p_user_id uuid,
  p_bank_name text,
  p_currency text DEFAULT 'ILS',
  p_parent_code text DEFAULT '1120'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_next_num int;
  v_new_code text;
  v_currency_display text;
  v_system_role text;
BEGIN
  -- Load parent
  SELECT * INTO v_parent
  FROM public.accounts
  WHERE user_id = p_user_id AND account_code = p_parent_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent account % not found for user %', p_parent_code, p_user_id;
  END IF;

  -- Next available numeric code under parent (parent_code=p_parent_code, numeric code starting with parent)
  SELECT COALESCE(MAX((account_code)::int), (p_parent_code)::int) + 1
  INTO v_next_num
  FROM public.accounts
  WHERE user_id = p_user_id
    AND parent_code = p_parent_code
    AND account_code ~ ('^' || p_parent_code || '[0-9]$');

  -- Ensure we produce a 4-digit code (1121..1129). If we exceed 1129, fall back to next non-conflicting.
  v_new_code := v_next_num::text;
  WHILE EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_user_id AND account_code = v_new_code) LOOP
    v_next_num := v_next_num + 1;
    v_new_code := v_next_num::text;
  END LOOP;

  -- Map currency code to display value used in accounts table
  v_currency_display := CASE upper(coalesce(p_currency,'ILS'))
    WHEN 'ILS' THEN 'شيكل'
    WHEN 'USD' THEN 'دولار'
    WHEN 'JOD' THEN 'دينار'
    ELSE coalesce(v_parent.currency, 'شيكل')
  END;

  v_system_role := CASE upper(coalesce(p_currency,'ILS'))
    WHEN 'USD' THEN 'bank_usd'
    WHEN 'JOD' THEN 'bank_jod'
    ELSE 'bank'
  END;

  INSERT INTO public.accounts (
    user_id, account_code, account_name, account_type, parent_code,
    is_active, is_system, is_system_protected, nature, currency,
    sub_group_label, display_order, system_role
  ) VALUES (
    p_user_id, v_new_code, coalesce(p_bank_name, 'حساب بنكي'), v_parent.account_type, p_parent_code,
    true, false, false, coalesce(v_parent.nature,'debit'), v_currency_display,
    v_parent.sub_group_label, coalesce(v_parent.display_order,20) + (v_next_num - (p_parent_code)::int),
    v_system_role
  );

  RETURN v_new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bank_leaf_account(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_bank_leaf_account(uuid, text, text, text) TO service_role;


-- =========================================================================
-- B) Backfill: for every bank_account currently mapped to 1120 (where 1120
--    is a parent i.e. has children), create a dedicated leaf, remap the
--    bank_account, and reclassify its historical transactions from 1120
--    to the new leaf (intra-tree reclassification — parent reports unchanged).
-- =========================================================================
DO $backfill$
DECLARE
  r RECORD;
  v_new_code text;
  v_new_acc_id uuid;
BEGIN
  FOR r IN
    SELECT ba.id AS bank_id, ba.user_id, ba.name, ba.currency
    FROM public.bank_accounts ba
    WHERE ba.gl_account_code = '1120'
      AND EXISTS (
        SELECT 1 FROM public.accounts c
        WHERE c.user_id = ba.user_id AND c.parent_code = '1120'
      )
  LOOP
    -- 1) Create dedicated leaf
    v_new_code := public.create_bank_leaf_account(
      r.user_id,
      COALESCE(r.name, 'حساب بنكي'),
      COALESCE(r.currency, 'ILS'),
      '1120'
    );

    SELECT id INTO v_new_acc_id
    FROM public.accounts
    WHERE user_id = r.user_id AND account_code = v_new_code;

    -- 2) Remap bank_account
    UPDATE public.bank_accounts
    SET gl_account_code = v_new_code,
        updated_at = now()
    WHERE id = r.bank_id;

    -- 3) Reclassify historical transactions on the debit side
    UPDATE public.transactions
    SET debit_account_code = v_new_code,
        account_id_debit = v_new_acc_id
    WHERE user_id = r.user_id
      AND debit_account_code = '1120';

    -- 4) Reclassify historical transactions on the credit side
    UPDATE public.transactions
    SET credit_account_code = v_new_code,
        account_id_credit = v_new_acc_id
    WHERE user_id = r.user_id
      AND credit_account_code = '1120';

    -- 5) Update default_bank_account setting if it points to the parent
    UPDATE public.company_settings
    SET default_bank_account = v_new_code,
        updated_at = now()
    WHERE user_id = r.user_id
      AND default_bank_account = '1120';

    RAISE NOTICE 'User % : bank % remapped 1120 -> %', r.user_id, r.bank_id, v_new_code;
  END LOOP;
END;
$backfill$;
