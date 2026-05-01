-- ============================================================================
-- Phase 5G.2 — Validator parity in create_invoice_with_entry
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_invoice_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_description text,
  p_payment_method text DEFAULT 'آجل'::text,
  p_currency text DEFAULT 'شيكل'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id UUID;
  v_debit_code TEXT;
  v_credit_code TEXT;
  v_tx_type TEXT;
  v_existing_id UUID;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  -- Determine accounts based on payment method
  -- Phase 5G.3 maps shekel cash to its sub-account 1115 by default to keep the
  -- new path on a postable leaf. Tenants who define their own children of 1110
  -- can still override by writing directly to that account (legacy path).
  CASE p_payment_method
    WHEN 'نقدي' THEN
      v_debit_code := '1115'; -- صندوق الشيكل (sub of 1110)
      v_credit_code := '4100';
      v_tx_type := 'sale_cash';
    WHEN 'بنك' THEN
      v_debit_code := '1120';
      v_credit_code := '4100';
      v_tx_type := 'sale_bank';
    WHEN 'شيك' THEN
      v_debit_code := '1150';
      v_credit_code := '4100';
      v_tx_type := 'sale_cheque';
    ELSE -- آجل (on credit) — Phase 5G.3 prefers AR sub-account 1131
      v_debit_code := '1131'; -- ذمم عملاء عام (sub of 1130)
      v_credit_code := '4100';
      v_tx_type := 'sale_credit';
  END CASE;

  -- Phase 5G.2 — parity with receipt/payment/JV RPCs
  PERFORM public._fc_validate_postable_account(p_user_id, v_debit_code);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit_code);

  -- Create journal entry
  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key
  ) VALUES (
    p_user_id,
    CURRENT_DATE,
    COALESCE(p_description, 'فاتورة مبيعات - ' || COALESCE(p_contact_name, '')),
    v_debit_code, v_credit_code,
    p_amount, p_currency, v_tx_type, p_contact_id,
    'INV-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
    p_payment_method,
    COALESCE(p_idempotency_key, 'INV-' || gen_random_uuid()::text)
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'duplicate', false);
END;
$function$;

-- ============================================================================
-- Phase 5G.3 — Idempotent ILS chart seeder
-- ============================================================================
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active)
SELECT cs.user_id, '1115', 'صندوق الشيكل', 'أصول', '1110', 'debit', true
FROM public.company_settings cs
WHERE COALESCE(cs.base_currency, 'شيكل') IN ('شيكل', 'ILS', 'ils')
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = cs.user_id AND a.account_code = '1115'
  );

INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active)
SELECT cs.user_id, '1131', 'ذمم عملاء عام', 'أصول', '1130', 'debit', true
FROM public.company_settings cs
WHERE COALESCE(cs.base_currency, 'شيكل') IN ('شيكل', 'ILS', 'ils')
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = cs.user_id AND a.account_code = '1131'
  );

INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active)
SELECT cs.user_id, '2111', 'ذمم موردين عام', 'خصوم', '2110', 'credit', true
FROM public.company_settings cs
WHERE COALESCE(cs.base_currency, 'شيكل') IN ('شيكل', 'ILS', 'ils')
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.user_id = cs.user_id AND a.account_code = '2111'
  );