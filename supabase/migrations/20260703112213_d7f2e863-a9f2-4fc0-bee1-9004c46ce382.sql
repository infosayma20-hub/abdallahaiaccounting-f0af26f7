CREATE OR REPLACE FUNCTION public.create_receipt_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_payment_method text DEFAULT 'نقدي'::text,
  p_description text DEFAULT NULL::text,
  p_currency text DEFAULT 'شيكل'::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_voucher_date date DEFAULT NULL::date,
  p_exchange_rate numeric DEFAULT NULL::numeric,
  p_reference text DEFAULT NULL::text,
  p_cash_account_code text DEFAULT NULL::text,
  p_contact_account_code text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_employee_id uuid DEFAULT NULL::uuid,
  p_workshop_id uuid DEFAULT NULL::uuid,
  p_allocations jsonb DEFAULT NULL::jsonb,
  p_cost_center_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_tx_id uuid;
  v_debit text;
  v_credit text;
  v_date date;
  v_idem text;
  v_alloc_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;

  v_date := COALESCE(p_voucher_date, CURRENT_DATE);
  v_idem := COALESCE(p_idempotency_key, 'RCV-' || gen_random_uuid()::text);

  SELECT id INTO v_existing
    FROM public.transactions
   WHERE user_id = p_user_id AND idempotency_key = v_idem
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  v_debit := COALESCE(
    p_cash_account_code,
    CASE
      WHEN p_payment_method ILIKE '%نقد%' OR p_payment_method ILIKE '%cash%' THEN '1110'
      WHEN p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%bank%' THEN '1120'
      WHEN p_payment_method ILIKE '%شيك%' OR p_payment_method ILIKE '%cheque%' THEN '1150'
      ELSE '1110'
    END
  );

  v_credit := COALESCE(
    p_contact_account_code,
    CASE WHEN p_employee_id IS NOT NULL THEN '1140' ELSE '1130' END
  );

  -- Contact receipts must stay on the customer's receivable ledger.
  -- Advances are tracked by allocation, not by splitting the visible statement to 2115.
  IF p_contact_id IS NOT NULL AND p_employee_id IS NULL THEN
    IF v_credit IS NULL OR v_credit LIKE '2115%' OR v_credit LIKE '1146%' OR v_credit NOT LIKE '113%' THEN
      v_credit := '1130';
    END IF;
    v_credit := public.resolve_postable_account(p_user_id, v_credit, p_contact_id, p_contact_name);
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit);

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount, workshop_id, cost_center_id
  )
  VALUES (
    p_user_id, v_date,
    COALESCE(p_description, 'سند قبض - ' || COALESCE(p_contact_name, '')),
    v_debit, v_credit, p_amount, COALESCE(p_currency, 'شيكل'),
    'receipt', COALESCE(p_reference, v_idem), v_idem,
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_amount ELSE NULL END,
    p_workshop_id, p_cost_center_id
  )
  RETURNING id INTO v_tx_id;

  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    v_alloc_result := public.allocate_voucher_to_invoices_atomic(
      p_user_id, NULL, v_tx_id, p_amount, p_allocations, false
    );
    IF NOT (v_alloc_result->>'success')::boolean THEN
      RAISE EXCEPTION 'allocation failed: %', v_alloc_result->>'error';
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false,
      'transaction_id', v_tx_id, 'allocations', v_alloc_result);
  END IF;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', v_tx_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_payment_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_payment_method text DEFAULT 'نقدي'::text,
  p_description text DEFAULT NULL::text,
  p_currency text DEFAULT 'شيكل'::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_voucher_date date DEFAULT NULL::date,
  p_exchange_rate numeric DEFAULT NULL::numeric,
  p_reference text DEFAULT NULL::text,
  p_cash_account_code text DEFAULT NULL::text,
  p_contact_account_code text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_employee_id uuid DEFAULT NULL::uuid,
  p_workshop_id uuid DEFAULT NULL::uuid,
  p_allocations jsonb DEFAULT NULL::jsonb,
  p_cost_center_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_tx_id uuid;
  v_debit text;
  v_credit text;
  v_date date;
  v_idem text;
  v_alloc_result jsonb;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;

  v_date := COALESCE(p_voucher_date, CURRENT_DATE);
  v_idem := COALESCE(p_idempotency_key, 'PAY-' || gen_random_uuid()::text);

  SELECT id INTO v_existing
    FROM public.transactions
   WHERE user_id = p_user_id AND idempotency_key = v_idem
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  v_debit := COALESCE(
    p_contact_account_code,
    CASE WHEN p_employee_id IS NOT NULL THEN '2140' ELSE '2110' END
  );
  v_credit := COALESCE(
    p_cash_account_code,
    CASE
      WHEN p_payment_method ILIKE '%نقد%' OR p_payment_method ILIKE '%cash%' THEN '1110'
      WHEN p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%bank%' THEN '1120'
      WHEN p_payment_method ILIKE '%شيك%' OR p_payment_method ILIKE '%cheque%' THEN '1160'
      ELSE '1110'
    END
  );

  -- Supplier/customer payments must resolve to the selected party leaf account,
  -- not to parent accounts or separate advance buckets.
  IF p_contact_id IS NOT NULL AND p_employee_id IS NULL THEN
    IF v_debit LIKE '113%' THEN
      v_debit := public.resolve_postable_account(p_user_id, v_debit, p_contact_id, p_contact_name);
    ELSE
      v_debit := public.resolve_postable_account(p_user_id, '2110', p_contact_id, p_contact_name);
    END IF;
  END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit);

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount, workshop_id, cost_center_id
  )
  VALUES (
    p_user_id, v_date,
    COALESCE(p_description, 'سند صرف - ' || COALESCE(p_contact_name, '')),
    v_debit, v_credit, p_amount, COALESCE(p_currency, 'شيكل'),
    'payment', COALESCE(p_reference, v_idem), v_idem,
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_amount ELSE NULL END,
    p_workshop_id, p_cost_center_id
  )
  RETURNING id INTO v_tx_id;

  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    v_alloc_result := public.allocate_voucher_to_invoices_atomic(
      p_user_id, NULL, v_tx_id, p_amount, p_allocations, false
    );
    IF NOT (v_alloc_result->>'success')::boolean THEN
      RAISE EXCEPTION 'allocation failed: %', v_alloc_result->>'error';
    END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', false,
      'transaction_id', v_tx_id, 'allocations', v_alloc_result);
  END IF;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', v_tx_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_receipt_with_entry(uuid, uuid, text, numeric, text, text, text, text, date, numeric, text, text, text, text, uuid, uuid, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_payment_with_entry(uuid, uuid, text, numeric, text, text, text, text, date, numeric, text, text, text, text, uuid, uuid, jsonb, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cascade_receipt_voucher_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_reverse_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    FOR v_tx IN
      SELECT t.id
      FROM public.transactions t
      WHERE t.user_id = NEW.user_id
        AND COALESCE(t.is_deleted, false) = false
        AND t.transaction_type <> 'reversal'
        AND (
          (NEW.linked_transaction_id IS NOT NULL AND t.id = NEW.linked_transaction_id)
          OR (NEW.receipt_number IS NOT NULL AND t.reference = NEW.receipt_number)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.transactions r
          WHERE r.user_id = t.user_id
            AND r.transaction_type = 'reversal'
            AND COALESCE(r.is_deleted, false) = false
            AND r.reversed_by_id = t.id
        )
    LOOP
      SELECT public.create_reverse_entry(
        v_tx.id,
        'إلغاء سند قبض ' || COALESCE(NEW.receipt_number, NEW.id::text),
        NEW.user_id
      ) INTO v_reverse_id;
    END LOOP;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    FOR v_tx IN
      SELECT t.id
      FROM public.transactions t
      WHERE t.user_id = NEW.user_id
        AND t.transaction_type <> 'reversal'
        AND (
          (NEW.linked_transaction_id IS NOT NULL AND t.id = NEW.linked_transaction_id)
          OR (NEW.receipt_number IS NOT NULL AND t.reference = NEW.receipt_number)
        )
    LOOP
      UPDATE public.transactions
         SET is_deleted = true,
             updated_at = now()
       WHERE user_id = NEW.user_id
         AND transaction_type = 'reversal'
         AND reversed_by_id = v_tx.id
         AND COALESCE(is_deleted, false) = false;

      UPDATE public.transactions
         SET reversed_by_id = NULL,
             updated_at = now()
       WHERE id = v_tx.id
         AND user_id = NEW.user_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DO $fix_masmar$
DECLARE
  v_owner uuid := '3358a87e-0a2e-4ad1-88c0-1e9ff8fda482'::uuid;
  v_contact uuid := '615cb3fd-c2de-418f-83e5-0af3f8a66ab2'::uuid;
  v_contact_account text := '11300032';
  v_contact_account_id uuid;
  v_batch text := 'abu_raed_masmar_receipt_statement_root_fix_20260703';
  v_tx record;
  v_reverse_id uuid;
BEGIN
  SELECT id INTO v_contact_account_id
  FROM public.accounts
  WHERE user_id = v_owner AND account_code = v_contact_account
  LIMIT 1;

  IF v_contact_account_id IS NULL THEN
    RAISE EXCEPTION 'Masmar contact account % not found for tenant %', v_contact_account, v_owner;
  END IF;

  FOR v_tx IN
    SELECT id, reference, debit_account_code, credit_account_code, account_id_debit, account_id_credit, amount, is_deleted, reversed_by_id
    FROM public.transactions
    WHERE user_id = v_owner
      AND contact_id = v_contact
      AND reference IN ('REC-2026-0029', 'REC-2026-0030')
      AND COALESCE(is_deleted, false) = false
      AND credit_account_code = '2115'
  LOOP
    INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_by)
    VALUES (
      v_batch,
      'transaction',
      v_tx.id,
      jsonb_build_object(
        'reference', v_tx.reference,
        'debit_account_code', v_tx.debit_account_code,
        'credit_account_code', v_tx.credit_account_code,
        'account_id_credit', v_tx.account_id_credit,
        'amount', v_tx.amount,
        'is_deleted', v_tx.is_deleted,
        'reversed_by_id', v_tx.reversed_by_id
      ),
      jsonb_build_object(
        'credit_account_code', v_contact_account,
        'account_id_credit', v_contact_account_id
      ),
      'تصحيح سند قبض مسمار ليظهر على حساب الذمة الموحد بدلاً من دفعات مقدمة عامة',
      v_owner
    );

    UPDATE public.transactions
       SET credit_account_code = v_contact_account,
           account_id_credit = v_contact_account_id,
           updated_at = now()
     WHERE id = v_tx.id;
  END LOOP;

  SELECT t.* INTO v_tx
  FROM public.receipt_vouchers rv
  JOIN public.transactions t ON t.id = rv.linked_transaction_id
  WHERE rv.user_id = v_owner
    AND rv.id = '0bdbe1cf-4c47-429c-915f-f774f83921ed'::uuid
    AND rv.status = 'cancelled'
    AND COALESCE(t.is_deleted, false) = false
    AND NOT EXISTS (
      SELECT 1
      FROM public.transactions r
      WHERE r.user_id = v_owner
        AND r.transaction_type = 'reversal'
        AND COALESCE(r.is_deleted, false) = false
        AND r.reversed_by_id = t.id
    )
  LIMIT 1;

  IF v_tx.id IS NOT NULL THEN
    SELECT public.create_reverse_entry(
      v_tx.id,
      'إلغاء سند قبض REC-2026-0029 - تصحيح سابق',
      v_owner
    ) INTO v_reverse_id;

    INSERT INTO public.finance_integrity_fix_log(fix_batch, entity_type, entity_id, old_value, new_value, reason, fixed_by)
    VALUES (
      v_batch,
      'receipt_voucher',
      '0bdbe1cf-4c47-429c-915f-f774f83921ed'::uuid,
      jsonb_build_object('linked_transaction_id', v_tx.id, 'missing_reversal', true),
      jsonb_build_object('reversal_transaction_id', v_reverse_id),
      'إنشاء حركة عكسية لسند قبض مسمار الملغى حتى يظهر أثر الإلغاء في كشف الحساب',
      v_owner
    );
  END IF;
END;
$fix_masmar$;