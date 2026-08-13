CREATE OR REPLACE FUNCTION public.sync_cash_invoice_voucher(
  p_user_id uuid,
  p_invoice_id uuid,
  p_is_cash boolean,
  p_invoice_type text,               -- 'sales' | 'purchase'
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_date date,
  p_cash_account_code text,
  p_currency text DEFAULT 'شيكل',
  p_exchange_rate numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_workshop_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL,
  p_posted_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem        text;
  v_tx          uuid;
  v_is_sales    boolean := (p_invoice_type = 'sales');
  v_cash        text;
  v_contact_acc text;
  v_doc_id      uuid;
  v_doc_num     text;
  v_is_foreign  boolean := (p_currency IS NOT NULL AND p_currency <> 'شيكل' AND p_currency <> 'ILS');
  v_use_rate    boolean := (COALESCE(p_exchange_rate,0) > 0 AND p_exchange_rate <> 1);
  v_amount_ils  numeric;
  v_alloc       jsonb;
  v_desc        text;
BEGIN
  IF p_user_id IS NULL OR p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;

  v_idem := 'INV-VOUCHER-' || p_invoice_id::text;

  SELECT id INTO v_tx
  FROM public.transactions
  WHERE user_id = p_user_id AND idempotency_key = v_idem AND is_deleted = false
  LIMIT 1;

  -- locate the existing voucher document (if any)
  IF v_is_sales THEN
    SELECT id, receipt_number INTO v_doc_id, v_doc_num
    FROM public.receipt_vouchers
    WHERE user_id = p_user_id
      AND (linked_transaction_id = v_tx OR (v_tx IS NULL AND false))
      AND COALESCE(status,'posted') <> 'cancelled'
    LIMIT 1;
  ELSE
    SELECT id, ref_number INTO v_doc_id, v_doc_num
    FROM public.vouchers
    WHERE user_id = p_user_id
      AND (linked_transaction_id = v_tx OR (v_tx IS NULL AND false))
      AND COALESCE(status,'posted') <> 'cancelled'
    LIMIT 1;
  END IF;

  -- ── Case A: invoice is no longer cash (or has no amount) → cancel the auto voucher ──
  IF NOT COALESCE(p_is_cash, false) OR COALESCE(p_amount,0) <= 0 THEN
    IF v_tx IS NOT NULL THEN
      DELETE FROM public.payment_invoice_links WHERE transaction_id = v_tx;
      IF v_doc_id IS NOT NULL THEN
        IF v_is_sales THEN
          UPDATE public.receipt_vouchers SET status = 'cancelled', updated_at = now() WHERE id = v_doc_id;
        ELSE
          UPDATE public.vouchers SET status = 'cancelled' WHERE id = v_doc_id;
        END IF;
      END IF;
      UPDATE public.transactions
         SET is_deleted = true, idempotency_key = NULL, updated_at = now()
       WHERE id = v_tx;
    END IF;
    RETURN jsonb_build_object('success', true, 'action', 'cancelled');
  END IF;

  -- ── Case B: cash invoice → create or update the voucher as one unit ──
  IF p_cash_account_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'cash account required');
  END IF;
  IF p_contact_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'contact required for cash invoice voucher');
  END IF;

  v_cash := p_cash_account_code;
  v_contact_acc := public.resolve_postable_account(
    p_user_id, CASE WHEN v_is_sales THEN '1130' ELSE '2110' END, p_contact_id, p_contact_name);

  PERFORM public._fc_validate_postable_account(p_user_id, v_cash);
  PERFORM public._fc_validate_postable_account(p_user_id, v_contact_acc);

  v_amount_ils := CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(p_amount * p_exchange_rate, 2) ELSE p_amount END;
  v_desc := CASE WHEN v_is_sales THEN 'سند قبض تلقائي' ELSE 'سند صرف تلقائي' END
            || ' — فاتورة ' || COALESCE(p_reference, '');

  IF v_tx IS NULL THEN
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, exchange_rate, foreign_amount,
      workshop_id, cost_center_id
    ) VALUES (
      p_user_id, p_date, v_desc,
      CASE WHEN v_is_sales THEN v_cash ELSE v_contact_acc END,
      CASE WHEN v_is_sales THEN v_contact_acc ELSE v_cash END,
      p_amount, COALESCE(p_currency, 'شيكل'),
      CASE WHEN v_is_sales THEN 'receipt' ELSE 'payment' END,
      COALESCE(p_reference, v_idem), v_idem,
      p_contact_id, 'نقدي',
      CASE WHEN v_is_foreign AND v_use_rate THEN p_exchange_rate ELSE NULL END,
      CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(p_amount / p_exchange_rate, 4) ELSE NULL END,
      p_workshop_id, p_cost_center_id
    ) RETURNING id INTO v_tx;
  ELSE
    UPDATE public.transactions SET
      transaction_date    = p_date,
      description         = v_desc,
      debit_account_code  = CASE WHEN v_is_sales THEN v_cash ELSE v_contact_acc END,
      credit_account_code = CASE WHEN v_is_sales THEN v_contact_acc ELSE v_cash END,
      amount              = p_amount,
      currency            = COALESCE(p_currency, 'شيكل'),
      transaction_type    = CASE WHEN v_is_sales THEN 'receipt' ELSE 'payment' END,
      contact_id          = p_contact_id,
      payment_method      = 'نقدي',
      exchange_rate       = CASE WHEN v_is_foreign AND v_use_rate THEN p_exchange_rate ELSE NULL END,
      foreign_amount      = CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(p_amount / p_exchange_rate, 4) ELSE NULL END,
      workshop_id         = p_workshop_id,
      cost_center_id      = p_cost_center_id,
      is_deleted          = false,
      updated_at          = now()
    WHERE id = v_tx;
  END IF;

  -- voucher document (keeps its original number when it already exists)
  IF v_is_sales THEN
    IF v_doc_id IS NULL THEN
      INSERT INTO public.receipt_vouchers(
        user_id, receipt_number, contact_id, contact_name, payment_date, amount,
        payment_method, deposit_account_code, notes, status, linked_transaction_id,
        auto_allocate, workshop_id
      ) VALUES (
        p_user_id, NULL, p_contact_id, p_contact_name, p_date, p_amount,
        'نقدي', v_cash, 'سند قبض تلقائي لفاتورة ' || COALESCE(p_reference,''), 'posted', v_tx,
        true, p_workshop_id
      ) RETURNING id, receipt_number INTO v_doc_id, v_doc_num;
    ELSE
      UPDATE public.receipt_vouchers SET
        contact_id = p_contact_id, contact_name = p_contact_name,
        payment_date = p_date, amount = p_amount,
        deposit_account_code = v_cash, linked_transaction_id = v_tx,
        notes = 'سند قبض تلقائي لفاتورة ' || COALESCE(p_reference,''),
        status = 'posted', workshop_id = p_workshop_id, updated_at = now()
      WHERE id = v_doc_id
      RETURNING receipt_number INTO v_doc_num;
    END IF;
  ELSE
    IF v_doc_id IS NULL THEN
      INSERT INTO public.vouchers(
        user_id, type, subtype, ref_number, date, contact_id, payment_method,
        amount, amount_ils, currency, exchange_rate, description, notes, status,
        linked_transaction_id, posted_by, posted_at, workshop_id, cost_center_id
      ) VALUES (
        p_user_id, 'payment', 'normal', NULL, p_date, p_contact_id, 'cash',
        p_amount, v_amount_ils,
        CASE WHEN COALESCE(p_currency,'شيكل') = 'شيكل' THEN 'ILS' ELSE p_currency END,
        COALESCE(p_exchange_rate, 1),
        'سند صرف تلقائي لفاتورة ' || COALESCE(p_reference,''),
        'سند صرف تلقائي لفاتورة ' || COALESCE(p_reference,''),
        'posted', v_tx, COALESCE(p_posted_by, p_user_id), now(), p_workshop_id, p_cost_center_id
      ) RETURNING id, ref_number INTO v_doc_id, v_doc_num;
    ELSE
      UPDATE public.vouchers SET
        date = p_date, contact_id = p_contact_id, amount = p_amount, amount_ils = v_amount_ils,
        currency = CASE WHEN COALESCE(p_currency,'شيكل') = 'شيكل' THEN 'ILS' ELSE p_currency END,
        exchange_rate = COALESCE(p_exchange_rate, 1),
        description = 'سند صرف تلقائي لفاتورة ' || COALESCE(p_reference,''),
        notes = 'سند صرف تلقائي لفاتورة ' || COALESCE(p_reference,''),
        status = 'posted', linked_transaction_id = v_tx,
        workshop_id = p_workshop_id, cost_center_id = p_cost_center_id
      WHERE id = v_doc_id
      RETURNING ref_number INTO v_doc_num;
    END IF;
  END IF;

  IF v_doc_num IS NOT NULL THEN
    UPDATE public.transactions SET reference = v_doc_num WHERE id = v_tx;
  END IF;

  -- rebuild the allocation of this voucher onto its invoice
  DELETE FROM public.payment_invoice_links WHERE transaction_id = v_tx;
  UPDATE public.invoices
     SET paid_amount = 0,
         remaining_amount = total_amount,
         payment_status = 'unpaid'
   WHERE id = p_invoice_id AND user_id = p_user_id;

  v_alloc := public.allocate_voucher_to_invoices_atomic(
    p_user_id, NULL, v_tx, p_amount,
    jsonb_build_array(jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount)),
    false
  );
  IF NOT COALESCE((v_alloc->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'allocation failed: %', v_alloc->>'error';
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'synced',
                            'transaction_id', v_tx, 'voucher_number', v_doc_num);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_cash_invoice_voucher(uuid,uuid,boolean,text,uuid,text,numeric,date,text,text,numeric,text,uuid,uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_cash_invoice_voucher(uuid,uuid,boolean,text,uuid,text,numeric,date,text,text,numeric,text,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cash_invoice_voucher(uuid,uuid,boolean,text,uuid,text,numeric,date,text,text,numeric,text,uuid,uuid,uuid) TO service_role;