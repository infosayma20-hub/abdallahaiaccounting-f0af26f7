
-- Read-only checker for whether a tenant can change its base currency.
-- Returns JSON: { allowed: bool, reason: text, posted_count: int, base_currency: text }
-- Safe: NEVER mutates data. Used only to enable/disable the UI button.

CREATE OR REPLACE FUNCTION public.check_can_change_base_currency(p_data_owner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_base text;
  v_posted_count int := 0;
  v_has_invoices boolean := false;
  v_has_vouchers boolean := false;
  v_has_pos boolean := false;
BEGIN
  -- Resolve owner: prefer explicit param, else current user (if they own a tenant)
  v_owner := COALESCE(
    p_data_owner_id,
    (SELECT id FROM auth.users WHERE id = auth.uid())
  );

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'لا يمكن تحديد الحساب',
      'posted_count', 0,
      'base_currency', 'ILS'
    );
  END IF;

  -- Read current base currency
  SELECT COALESCE(base_currency, 'ILS') INTO v_base
  FROM public.company_settings
  WHERE user_id = v_owner
  LIMIT 1;

  v_base := COALESCE(v_base, 'ILS');

  -- Count posted accounting activity across the main ledgers.
  -- Any posted (non-draft) transaction blocks a base-currency change (IAS 21 / SAP behavior).
  SELECT COUNT(*) INTO v_posted_count
  FROM public.transactions
  WHERE user_id = v_owner
    AND COALESCE(status, 'posted') <> 'draft';

  SELECT EXISTS(SELECT 1 FROM public.invoices WHERE user_id = v_owner LIMIT 1) INTO v_has_invoices;
  SELECT EXISTS(SELECT 1 FROM public.vouchers WHERE user_id = v_owner LIMIT 1) INTO v_has_vouchers;
  SELECT EXISTS(SELECT 1 FROM public.pos_orders WHERE data_owner_id = v_owner LIMIT 1) INTO v_has_pos;

  IF v_posted_count > 0 OR v_has_invoices OR v_has_vouchers OR v_has_pos THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'يوجد قيود / فواتير / سندات منشورة — لا يمكن تغيير العملة الأساسية',
      'posted_count', v_posted_count,
      'has_invoices', v_has_invoices,
      'has_vouchers', v_has_vouchers,
      'has_pos', v_has_pos,
      'base_currency', v_base
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'لا توجد قيود منشورة — يمكن تغيير العملة الأساسية',
    'posted_count', 0,
    'base_currency', v_base
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_can_change_base_currency(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_can_change_base_currency(uuid) TO service_role;
