
-- =============================================
-- MIGRATION 3: Atomic RPC Functions
-- C-06: Atomic operations for invoices, cheques, salary
-- =============================================

-- 1. Atomic Invoice + Journal Entry
CREATE OR REPLACE FUNCTION public.create_invoice_with_entry(
  p_user_id UUID,
  p_contact_id UUID,
  p_contact_name TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_payment_method TEXT DEFAULT 'آجل',
  p_currency TEXT DEFAULT 'شيكل',
  p_items JSONB DEFAULT '[]'::JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_debit_code TEXT;
  v_credit_code TEXT;
  v_tx_type TEXT;
  v_existing_id UUID;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_existing_id,
        'duplicate', true
      );
    END IF;
  END IF;

  -- Determine accounts based on payment method
  CASE p_payment_method
    WHEN 'نقدي' THEN
      v_debit_code := '1110'; -- الصندوق
      v_credit_code := '4100'; -- إيرادات المبيعات
      v_tx_type := 'sale_cash';
    WHEN 'بنك' THEN
      v_debit_code := '1120'; -- البنك
      v_credit_code := '4100';
      v_tx_type := 'sale_bank';
    WHEN 'شيك' THEN
      v_debit_code := '1150'; -- شيكات واردة
      v_credit_code := '4100';
      v_tx_type := 'sale_cheque';
    ELSE -- آجل (on credit)
      v_debit_code := '1130'; -- ذمم عملاء
      v_credit_code := '4100';
      v_tx_type := 'sale_credit';
  END CASE;

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
    p_amount,
    p_currency,
    v_tx_type,
    p_contact_id,
    'INV-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD-HH24MISS'),
    p_payment_method,
    p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'duplicate', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- 2. Atomic Purchase + Journal Entry
CREATE OR REPLACE FUNCTION public.create_purchase_with_entry(
  p_user_id UUID,
  p_contact_id UUID,
  p_contact_name TEXT,
  p_amount NUMERIC,
  p_description TEXT,
  p_payment_method TEXT DEFAULT 'آجل',
  p_currency TEXT DEFAULT 'شيكل',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_debit_code TEXT;
  v_credit_code TEXT;
  v_tx_type TEXT;
  v_existing_id UUID;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  v_debit_code := '5200'; -- تكلفة البضاعة المباعة

  CASE p_payment_method
    WHEN 'نقدي' THEN
      v_credit_code := '1110';
      v_tx_type := 'purchase_cash';
    WHEN 'بنك' THEN
      v_credit_code := '1120';
      v_tx_type := 'purchase_bank';
    WHEN 'شيك' THEN
      v_credit_code := '1150';
      v_tx_type := 'purchase_cheque';
    ELSE
      v_credit_code := '2100'; -- ذمم موردين
      v_tx_type := 'purchase_credit';
  END CASE;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key
  ) VALUES (
    p_user_id, CURRENT_DATE,
    COALESCE(p_description, 'فاتورة مشتريات - ' || COALESCE(p_contact_name, '')),
    v_debit_code, v_credit_code, p_amount, p_currency, v_tx_type,
    p_contact_id,
    'PUR-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD-HH24MISS'),
    p_payment_method, p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'duplicate', false);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Atomic Receipt (سند قبض) + Journal Entry
CREATE OR REPLACE FUNCTION public.create_receipt_with_entry(
  p_user_id UUID,
  p_contact_id UUID,
  p_contact_name TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'نقدي',
  p_description TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'شيكل',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_debit_code TEXT;
  v_existing_id UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  CASE p_payment_method
    WHEN 'نقدي' THEN v_debit_code := '1110';
    WHEN 'بنك' THEN v_debit_code := '1120';
    WHEN 'شيك' THEN v_debit_code := '1150';
    ELSE v_debit_code := '1110';
  END CASE;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key
  ) VALUES (
    p_user_id, CURRENT_DATE,
    COALESCE(p_description, 'سند قبض من ' || COALESCE(p_contact_name, '')),
    v_debit_code, '1130', -- ذمم عملاء
    p_amount, p_currency, 'receipt', p_contact_id,
    'RCV-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD-HH24MISS'),
    p_payment_method, p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'duplicate', false);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Atomic Payment (سند صرف) + Journal Entry
CREATE OR REPLACE FUNCTION public.create_payment_with_entry(
  p_user_id UUID,
  p_contact_id UUID,
  p_contact_name TEXT,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'نقدي',
  p_description TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'شيكل',
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_credit_code TEXT;
  v_existing_id UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  CASE p_payment_method
    WHEN 'نقدي' THEN v_credit_code := '1110';
    WHEN 'بنك' THEN v_credit_code := '1120';
    WHEN 'شيك' THEN v_credit_code := '1150';
    ELSE v_credit_code := '1110';
  END CASE;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key
  ) VALUES (
    p_user_id, CURRENT_DATE,
    COALESCE(p_description, 'سند صرف إلى ' || COALESCE(p_contact_name, '')),
    '2100', v_credit_code, -- ذمم موردين
    p_amount, p_currency, 'payment', p_contact_id,
    'PAY-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDD-HH24MISS'),
    p_payment_method, p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'duplicate', false);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
