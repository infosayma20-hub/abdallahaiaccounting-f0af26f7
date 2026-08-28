CREATE OR REPLACE FUNCTION public.create_sale_invoice_atomic(
  p_user_id uuid, p_contact_id uuid, p_contact_name text, p_invoice_date date,
  p_payment_method text, p_currency text, p_exchange_rate numeric, p_subtotal numeric,
  p_discount_amount numeric, p_tax_amount numeric, p_total_amount numeric,
  p_paid_amount numeric, p_notes text, p_items jsonb, p_idempotency_key text,
  p_source text DEFAULT 'manual'::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_tx_id UUID;
  v_debit_code TEXT;
  v_credit_code TEXT := '4100';
  v_tx_type TEXT;
  v_amount_ils NUMERIC;
  v_remaining NUMERIC;
  v_payment_status TEXT;
  v_item JSONB;
  v_stock_result JSONB;
  v_alerts INTEGER := 0;
BEGIN
  -- Idempotency: local_id is the anchor; legacy notes-tag kept as fallback
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, invoice_number INTO v_invoice_id, v_invoice_number
    FROM public.invoices
    WHERE user_id = p_user_id
      AND (local_id = p_idempotency_key OR notes LIKE '%' || p_idempotency_key || '%')
    LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number);
    END IF;
  END IF;

  v_remaining := p_total_amount - COALESCE(p_paid_amount, 0);
  v_payment_status := CASE
    WHEN COALESCE(p_paid_amount, 0) >= p_total_amount THEN 'مدفوع'
    WHEN COALESCE(p_paid_amount, 0) > 0 THEN 'مدفوع جزئياً'
    ELSE 'غير مدفوع'
  END;

  INSERT INTO public.invoices (
    user_id, invoice_type, contact_name, contact_id, invoice_date,
    subtotal, discount_amount, tax_amount, total_amount,
    paid_amount, remaining_amount, payment_status, payment_method,
    currency, exchange_rate, status, source, notes, local_id
  ) VALUES (
    p_user_id, 'sale', p_contact_name, p_contact_id, p_invoice_date,
    p_subtotal, COALESCE(p_discount_amount, 0), COALESCE(p_tax_amount, 0), p_total_amount,
    COALESCE(p_paid_amount, 0), v_remaining, v_payment_status, p_payment_method,
    COALESCE(p_currency, 'شيكل'), COALESCE(p_exchange_rate, 1),
    'posted', COALESCE(p_source, 'manual'),
    COALESCE(p_notes, ''), p_idempotency_key
  ) RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.invoice_items (
        invoice_id, product_id, product_name, quantity, unit_price,
        discount_percent, tax_percent, total, cost_price
      ) VALUES (
        v_invoice_id,
        NULLIF(v_item->>'product_id','')::uuid,
        COALESCE(v_item->>'product_name', 'صنف'),
        COALESCE((v_item->>'quantity')::numeric, 1),
        COALESCE((v_item->>'unit_price')::numeric, 0),
        COALESCE((v_item->>'discount_percent')::numeric, 0),
        COALESCE((v_item->>'tax_percent')::numeric, 0),
        COALESCE((v_item->>'total')::numeric, 0),
        NULLIF(v_item->>'cost_price','')::numeric
      );
    END LOOP;
  END IF;

  v_amount_ils := CASE
    WHEN COALESCE(p_currency,'شيكل') NOT IN ('شيكل','ILS') AND COALESCE(p_exchange_rate,1) > 0
      THEN p_total_amount * p_exchange_rate
    ELSE p_total_amount END;

  v_debit_code := '1130';
  v_tx_type := 'sale_credit';

  INSERT INTO public.transactions (
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, idempotency_key, contact_id,
    payment_method, notes, exchange_rate, foreign_amount
  ) VALUES (
    p_user_id, p_invoice_date,
    'فاتورة مبيعات ' || COALESCE(v_invoice_number,'') || ' - ' || COALESCE(p_contact_name,''),
    v_debit_code, v_credit_code, v_amount_ils, COALESCE(p_currency,'شيكل'),
    v_tx_type, v_invoice_number,
    COALESCE(p_idempotency_key, 'INV-' || v_invoice_id::text),
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN COALESCE(p_currency,'شيكل') NOT IN ('شيكل','ILS') THEN p_exchange_rate ELSE NULL END,
    CASE WHEN COALESCE(p_currency,'شيكل') NOT IN ('شيكل','ILS') THEN p_total_amount ELSE NULL END
  ) RETURNING id INTO v_tx_id;

  UPDATE public.invoices SET linked_transaction_id = v_tx_id WHERE id = v_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number, 'transaction_id', v_tx_id, 'alerts', v_alerts);
END;
$function$;