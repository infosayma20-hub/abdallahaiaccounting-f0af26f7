
CREATE OR REPLACE FUNCTION public.create_purchase_with_entry(p_user_id uuid, p_contact_id uuid, p_contact_name text, p_amount numeric, p_description text, p_payment_method text DEFAULT 'آجل'::text, p_currency text DEFAULT 'شيكل'::text, p_idempotency_key text DEFAULT NULL::text)
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
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.transactions
    WHERE idempotency_key = p_idempotency_key;
    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'transaction_id', v_existing_id, 'duplicate', true);
    END IF;
  END IF;

  v_debit_code := '5110';

  CASE p_payment_method
    WHEN 'نقدي' THEN v_credit_code := '1110'; v_tx_type := 'purchase_cash';
    WHEN 'بنك' THEN v_credit_code := '1120'; v_tx_type := 'purchase_bank';
    WHEN 'شيك' THEN v_credit_code := '1150'; v_tx_type := 'purchase_cheque';
    ELSE v_credit_code := '2100'; v_tx_type := 'purchase_credit';
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
$function$;
