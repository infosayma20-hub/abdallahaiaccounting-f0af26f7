
-- === Enhanced create_cash_transfer_atomic (backwards compatible) ===
CREATE OR REPLACE FUNCTION public.create_cash_transfer_atomic(
  p_user_id uuid,
  p_from_account_code text,
  p_to_account_code text,
  p_amount numeric,
  p_currency text DEFAULT 'شيكل',
  p_transfer_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_from_box_id uuid DEFAULT NULL,
  p_to_box_id uuid DEFAULT NULL,
  p_exchange_rate numeric DEFAULT 1,
  p_foreign_amount numeric DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid; v_tx_id uuid; v_ref text; v_ct_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','amount must be > 0'); END IF;
  IF p_from_account_code = p_to_account_code THEN RETURN jsonb_build_object('success',false,'error','from = to account'); END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'TRF-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing_id FROM public.transactions
   WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing_id);
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, p_from_account_code);
  PERFORM public._fc_validate_postable_account(p_user_id, p_to_account_code);

  v_ref := 'TRF-'||to_char(now(),'YYYYMMDD-HH24MISS');

  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, foreign_amount, exchange_rate,
    transaction_type, reference, idempotency_key, payment_method
  ) VALUES (
    p_user_id, p_transfer_date,
    COALESCE(p_description, 'تحويل من '||p_from_account_code||' إلى '||p_to_account_code),
    p_to_account_code, p_from_account_code,
    p_amount, p_currency, p_foreign_amount, p_exchange_rate,
    'cash_transfer', v_ref, p_idempotency_key, 'transfer'
  ) RETURNING id INTO v_tx_id;

  -- Sync to cash_transfers table when box IDs supplied
  IF p_from_box_id IS NOT NULL AND p_to_box_id IS NOT NULL THEN
    INSERT INTO public.cash_transfers(
      user_id, from_box_id, to_box_id, amount, currency, exchange_rate, amount_ils,
      transfer_date, description, transfer_type, created_by
    ) VALUES (
      p_user_id, p_from_box_id, p_to_box_id, p_amount,
      CASE WHEN p_currency='شيكل' THEN 'ILS' ELSE p_currency END,
      COALESCE(p_exchange_rate,1),
      p_amount * COALESCE(p_exchange_rate,1),
      p_transfer_date, p_description, p_source, p_user_id
    ) RETURNING id INTO v_ct_id;
  END IF;

  RETURN jsonb_build_object('success',true,'duplicate',false,
    'transaction_id',v_tx_id,'cash_transfer_id',v_ct_id,'reference',v_ref);
END;
$function$;

-- === Diagnostic view: invoices whose payments were cancelled ===
CREATE OR REPLACE VIEW public.v_invoices_payment_mismatch AS
SELECT DISTINCT i.id AS invoice_id, i.user_id, i.invoice_number, i.status,
  i.paid_amount, i.total_amount,
  (SELECT COALESCE(SUM(pil.allocated_amount),0)
   FROM payment_invoice_links pil
   JOIN transactions t ON t.id=pil.transaction_id
   WHERE pil.invoice_id=i.id AND COALESCE(t.is_deleted,false)=false) AS active_allocations,
  'الفاتورة تُظهر مبلغ مسدد لا يطابق التخصيصات النشطة' AS description
FROM invoices i
WHERE i.paid_amount > 0
  AND ABS(i.paid_amount - (
    SELECT COALESCE(SUM(pil.allocated_amount),0)
    FROM payment_invoice_links pil
    JOIN transactions t ON t.id=pil.transaction_id
    WHERE pil.invoice_id=i.id AND COALESCE(t.is_deleted,false)=false
  )) > 0.01;

GRANT SELECT ON public.v_invoices_payment_mismatch TO authenticated;

-- === Diagnostic view: cash_transfers missing GL entry ===
CREATE OR REPLACE VIEW public.v_cash_transfers_missing_gl AS
SELECT ct.id, ct.user_id, ct.transfer_date, ct.amount, ct.currency,
  ct.description, ct.transfer_type,
  'تحويل صندوق بدون قيد محاسبي مرتبط' AS issue
FROM cash_transfers ct
WHERE NOT EXISTS (
  SELECT 1 FROM transactions t
  WHERE t.user_id=ct.user_id
    AND t.transaction_type='cash_transfer'
    AND t.transaction_date=ct.transfer_date
    AND ABS(t.amount-ct.amount)<0.01
    AND COALESCE(t.is_deleted,false)=false
);

GRANT SELECT ON public.v_cash_transfers_missing_gl TO authenticated;
