CREATE OR REPLACE FUNCTION public.create_invoice_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_description text,
  p_payment_method text DEFAULT 'آجل'::text,
  p_currency text DEFAULT 'شيكل'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL::text,
  p_invoice_type text DEFAULT 'sales'::text,
  p_transaction_date date DEFAULT NULL::date,
  p_foreign_amount numeric DEFAULT NULL::numeric,
  p_exchange_rate numeric DEFAULT NULL::numeric,
  p_reference text DEFAULT NULL::text,
  p_workshop_id uuid DEFAULT NULL::uuid,
  p_cost_center_name text DEFAULT NULL::text
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
  v_date DATE := COALESCE(p_transaction_date, CURRENT_DATE);
  v_ref TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  IF p_invoice_type = 'purchase' THEN
    -- Purchase invoice: Dr 5111 Purchases / Cr (cash|bank|cheque-out|AP)
    CASE p_payment_method
      WHEN 'نقدي' THEN
        v_debit_code := '5111'; v_credit_code := '1115'; v_tx_type := 'purchase_cash';
      WHEN 'بنك' THEN
        v_debit_code := '5111'; v_credit_code := '1121'; v_tx_type := 'purchase_bank';
      WHEN 'شيك' THEN
        v_debit_code := '5111'; v_credit_code := '2180'; v_tx_type := 'purchase_cheque';
      ELSE -- آجل
        v_debit_code := '5111'; v_credit_code := '2111'; v_tx_type := 'purchase_credit';
    END CASE;
  ELSE
    -- Sales invoice (default): Dr (cash|bank|cheque-in|AR) / Cr 4110 Revenue
    CASE p_payment_method
      WHEN 'نقدي' THEN
        v_debit_code := '1115'; v_credit_code := '4110'; v_tx_type := 'sale_cash';
      WHEN 'بنك' THEN
        v_debit_code := '1121'; v_credit_code := '4110'; v_tx_type := 'sale_bank';
      WHEN 'شيك' THEN
        v_debit_code := '1150'; v_credit_code := '4110'; v_tx_type := 'sale_cheque';
      ELSE -- آجل
        v_debit_code := '1131'; v_credit_code := '4110'; v_tx_type := 'sale_credit';
    END CASE;
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, v_debit_code);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit_code);

  v_ref := COALESCE(p_reference, 'INV-' || to_char(now(), 'YYYYMMDD-HH24MISS'));

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, foreign_amount, exchange_rate,
    transaction_type, contact_id,
    reference, payment_method, idempotency_key,
    workshop_id, cost_center_name
  ) VALUES (
    p_user_id, v_date,
    COALESCE(p_description,
      (CASE WHEN p_invoice_type = 'purchase' THEN 'فاتورة مشتريات - ' ELSE 'فاتورة مبيعات - ' END)
      || COALESCE(p_contact_name, '')),
    v_debit_code, v_credit_code,
    p_amount, p_currency, p_foreign_amount, p_exchange_rate,
    v_tx_type, p_contact_id,
    v_ref, p_payment_method,
    COALESCE(p_idempotency_key, 'INV-' || gen_random_uuid()::text),
    p_workshop_id, p_cost_center_name
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'duplicate', false,
    'debit_account_code', v_debit_code,
    'credit_account_code', v_credit_code
  );
END;
$function$;