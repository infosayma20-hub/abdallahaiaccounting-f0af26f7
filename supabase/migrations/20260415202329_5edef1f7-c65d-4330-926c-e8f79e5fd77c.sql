
CREATE OR REPLACE FUNCTION public.recreate_invoice_transaction(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv           RECORD;
  v_debit_code  text;
  v_credit_code text;
  v_tx_type     text;
  v_amount_ils  numeric;
  v_new_tx_id   uuid;
BEGIN
  SELECT * INTO inv
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة: %', p_invoice_id;
  END IF;

  v_amount_ils := CASE
    WHEN inv.currency != 'شيكل' 
      AND inv.exchange_rate IS NOT NULL 
      AND inv.exchange_rate != 1
    THEN inv.total_amount * inv.exchange_rate
    ELSE inv.total_amount
  END;

  v_debit_code := CASE inv.payment_method
    WHEN 'cash'     THEN '1110'
    WHEN 'transfer' THEN '1120'
    WHEN 'cheque'   THEN '1150'
    ELSE '1130'
  END;

  IF inv.invoice_type = 'sale' THEN
    v_credit_code := '4100';
    v_tx_type := CASE inv.payment_method
      WHEN 'cash'     THEN 'sale_cash'
      WHEN 'transfer' THEN 'sale_bank'
      WHEN 'cheque'   THEN 'sale_cheque'
      ELSE 'sale_credit'
    END;
  ELSE
    v_credit_code := CASE inv.payment_method
      WHEN 'cash' THEN v_debit_code
      ELSE '2110'
    END;
    v_debit_code  := '5110';
    v_tx_type := CASE inv.payment_method
      WHEN 'cash' THEN 'purchase_cash'
      ELSE 'purchase_credit'
    END;
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, foreign_amount, exchange_rate,
    transaction_type, contact_id, reference,
    payment_method, idempotency_key, is_deleted
  )
  VALUES (
    inv.user_id, inv.invoice_date,
    'فاتورة ' || 
      CASE inv.invoice_type WHEN 'sale' THEN 'مبيعات' ELSE 'مشتريات' END ||
      ' ' || inv.invoice_number || ' - ' || COALESCE(inv.contact_name, ''),
    v_debit_code, v_credit_code,
    v_amount_ils, inv.currency,
    CASE WHEN inv.currency != 'شيكل' 
         AND inv.exchange_rate IS NOT NULL 
         AND inv.exchange_rate != 1
         THEN inv.total_amount ELSE NULL END,
    CASE WHEN inv.exchange_rate IS NOT NULL AND inv.exchange_rate != 1 
         THEN inv.exchange_rate ELSE NULL END,
    v_tx_type, inv.contact_id, inv.invoice_number,
    inv.payment_method,
    'REINSTATE-INV-' || inv.id || '-' || extract(epoch from now())::bigint,
    false
  )
  RETURNING id INTO v_new_tx_id;

  UPDATE public.invoices
  SET linked_transaction_id = v_new_tx_id
  WHERE id = p_invoice_id;

  RETURN v_new_tx_id;
END;
$$;
