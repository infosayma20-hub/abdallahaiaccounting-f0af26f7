CREATE OR REPLACE FUNCTION public.create_mixed_voucher_atomic(p_user_id uuid, p_kind text, p_contact_id uuid, p_contact_name text, p_voucher_date date, p_currency text DEFAULT 'شيكل'::text, p_exchange_rate numeric DEFAULT NULL::numeric, p_description text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_cash_amount numeric DEFAULT 0, p_cash_account_code text DEFAULT NULL::text, p_cheques jsonb DEFAULT '[]'::jsonb, p_allocations jsonb DEFAULT NULL::jsonb, p_idempotency_key text DEFAULT NULL::text, p_employee_id uuid DEFAULT NULL::uuid, p_workshop_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_counter_account_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
  v_idem text;
  v_date date;
  v_ref text;
  v_cheques_total numeric := 0;
  v_total numeric;
  v_cheque_tx_id uuid;
  v_cash_tx_id uuid;
  v_primary_tx_id uuid;
  v_contact_acct text;
  v_cheque_acct text;
  v_cash_acct text;
  v_tx_type text;
  v_ch jsonb;
  v_alloc_result jsonb;
  v_voucher_id uuid;
  v_currency_code text;
  v_is_foreign boolean := (p_currency IS NOT NULL AND p_currency <> 'شيكل' AND p_currency <> 'ILS');
  v_use_rate   boolean := (COALESCE(p_exchange_rate,0) > 0 AND p_exchange_rate <> 1);
  v_use_counter_acct boolean := (p_contact_id IS NULL AND p_employee_id IS NULL AND NULLIF(p_counter_account_code,'') IS NOT NULL);
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user required');
  END IF;
  IF p_kind NOT IN ('receipt','payment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'kind must be receipt or payment');
  END IF;

  v_date := COALESCE(p_voucher_date, CURRENT_DATE);
  v_idem := COALESCE(p_idempotency_key, 'MIX-' || gen_random_uuid()::text);
  p_cash_amount := COALESCE(p_cash_amount, 0);

  SELECT id INTO v_existing FROM public.transactions
    WHERE user_id = p_user_id
      AND (idempotency_key = v_idem OR idempotency_key = v_idem || '-CASH' OR idempotency_key = v_idem || '-CHQ')
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  IF p_cheques IS NOT NULL AND jsonb_array_length(p_cheques) > 0 THEN
    SELECT COALESCE(SUM(COALESCE((x->>'amount')::numeric, 0)), 0)
      INTO v_cheques_total
      FROM jsonb_array_elements(p_cheques) x;
  END IF;

  v_total := p_cash_amount + v_cheques_total;
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'total must be > 0');
  END IF;
  IF p_cash_amount > 0 AND p_cash_account_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'cash_account_code required when cash > 0');
  END IF;

  IF p_kind = 'receipt' THEN
    v_tx_type := 'receipt';
    v_cheque_acct := '1150';
    v_contact_acct := CASE WHEN p_employee_id IS NOT NULL THEN '1140' ELSE '1130' END;
    v_cash_acct := p_cash_account_code;
  ELSE
    v_tx_type := 'payment';
    v_cheque_acct := '1160';
    v_contact_acct := CASE WHEN p_employee_id IS NOT NULL THEN '1140' ELSE '2110' END;
    v_cash_acct := p_cash_account_code;
  END IF;

  IF p_contact_id IS NOT NULL AND p_employee_id IS NULL THEN
    v_contact_acct := public.resolve_postable_account(
      p_user_id,
      CASE WHEN p_kind = 'receipt' THEN '1130' ELSE '2110' END,
      p_contact_id,
      p_contact_name,
      CASE WHEN p_kind = 'receipt' THEN 'عميل' ELSE 'مورد' END
    );
  END IF;

  -- Direct GL counter-account (e.g. expense / other revenue) when no contact/employee.
  IF v_use_counter_acct THEN
    v_contact_acct := p_counter_account_code;
  END IF;

  IF p_cash_amount > 0 THEN
    PERFORM public._fc_validate_postable_account(p_user_id, v_cash_acct);
  END IF;
  IF v_cheques_total > 0 THEN
    PERFORM public._fc_validate_postable_account(p_user_id, v_cheque_acct);
  END IF;
  PERFORM public._fc_validate_postable_account(p_user_id, v_contact_acct);

  v_ref := COALESCE(
    p_reference,
    CASE WHEN p_kind='receipt' THEN 'RCV-MIX-' ELSE 'PMT-MIX-' END
    || to_char(now(),'YYYYMMDD-HH24MISS')
  );

  IF p_cash_amount > 0 THEN
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, notes,
      exchange_rate, foreign_amount, workshop_id, cost_center_id
    ) VALUES (
      p_user_id, v_date,
      COALESCE(p_description, (CASE WHEN p_kind='receipt' THEN 'سند قبض مختلط - ' ELSE 'سند صرف مختلط - ' END) || COALESCE(p_contact_name,''))
        || ' (نقدي)',
      CASE WHEN p_kind='receipt' THEN v_cash_acct ELSE v_contact_acct END,
      CASE WHEN p_kind='receipt' THEN v_contact_acct ELSE v_cash_acct END,
      p_cash_amount, COALESCE(p_currency,'شيكل'),
      v_tx_type, v_ref, v_idem || '-CASH',
      p_contact_id, 'نقدي', p_notes,
      CASE WHEN v_is_foreign AND v_use_rate THEN p_exchange_rate ELSE NULL END,
      CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(p_cash_amount / p_exchange_rate, 4) ELSE NULL END,
      p_workshop_id, p_cost_center_id
    ) RETURNING id INTO v_cash_tx_id;
  END IF;

  IF v_cheques_total > 0 THEN
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, notes,
      exchange_rate, foreign_amount, workshop_id, cost_center_id
    ) VALUES (
      p_user_id, v_date,
      COALESCE(p_description, (CASE WHEN p_kind='receipt' THEN 'سند قبض مختلط - ' ELSE 'سند صرف مختلط - ' END) || COALESCE(p_contact_name,''))
        || ' (شيكات ' || jsonb_array_length(p_cheques)::text || ')',
      CASE WHEN p_kind='receipt' THEN v_cheque_acct ELSE v_contact_acct END,
      CASE WHEN p_kind='receipt' THEN v_contact_acct ELSE v_cheque_acct END,
      v_cheques_total, COALESCE(p_currency,'شيكل'),
      v_tx_type, v_ref, v_idem || '-CHQ',
      p_contact_id, 'شيك', p_notes,
      CASE WHEN v_is_foreign AND v_use_rate THEN p_exchange_rate ELSE NULL END,
      CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(v_cheques_total / p_exchange_rate, 4) ELSE NULL END,
      p_workshop_id, p_cost_center_id
    ) RETURNING id INTO v_cheque_tx_id;
  END IF;

  v_primary_tx_id := COALESCE(v_cash_tx_id, v_cheque_tx_id);

  v_currency_code := CASE
    WHEN p_currency IN ('ILS','USD','JOD','EUR','EGP') THEN p_currency
    WHEN p_currency = 'شيكل' THEN 'ILS'
    WHEN p_currency = 'دولار' THEN 'USD'
    WHEN p_currency = 'دينار' THEN 'JOD'
    WHEN p_currency = 'يورو' THEN 'EUR'
    ELSE 'ILS'
  END;

  INSERT INTO public.vouchers(
    user_id, type, subtype, ref_number, date,
    contact_id, employee_id, workshop_id, cost_center_id,
    payment_method, amount, currency, exchange_rate, amount_ils,
    description, notes, status, posted_by, posted_at,
    linked_transaction_id
  ) VALUES (
    p_user_id,
    v_tx_type, 'mixed',
    v_ref, v_date,
    p_contact_id, p_employee_id, p_workshop_id, p_cost_center_id,
    'مختلط',
    CASE WHEN v_is_foreign AND v_use_rate THEN ROUND(v_total / p_exchange_rate, 4) ELSE v_total END,
    v_currency_code,
    COALESCE(p_exchange_rate, 1),
    v_total,
    COALESCE(p_description, (CASE WHEN p_kind='receipt' THEN 'سند قبض مختلط - ' ELSE 'سند صرف مختلط - ' END) || COALESCE(p_contact_name,'')),
    p_notes,
    'posted', p_user_id, now(),
    v_primary_tx_id
  ) RETURNING id INTO v_voucher_id;

  IF v_cheques_total > 0 THEN
    FOR v_ch IN SELECT * FROM jsonb_array_elements(p_cheques) LOOP
      INSERT INTO public.cheques(
        user_id, cheque_type, status,
        cheque_number, bank_name, cheque_date, amount, currency,
        party_name, party_type, contact_id, linked_account,
        account_number, notes, linked_transaction_id, voucher_id
      ) VALUES (
        p_user_id,
        (CASE WHEN p_kind='receipt' THEN 'وارد' ELSE 'صادر' END)::public.cheque_type,
        'مسجل'::public.cheque_status,
        COALESCE(v_ch->>'number',''),
        COALESCE(v_ch->>'bank',''),
        COALESCE(NULLIF(v_ch->>'date','')::date, v_date),
        COALESCE((v_ch->>'amount')::numeric, 0),
        COALESCE(p_currency,'شيكل'),
        COALESCE(p_contact_name,''),
        CASE WHEN v_use_counter_acct THEN 'حساب' WHEN p_kind='receipt' THEN 'عميل' ELSE 'مورد' END,
        p_contact_id,
        v_cheque_acct,
        NULLIF(v_ch->>'account_number',''),
        NULLIF(v_ch->>'notes',''),
        v_cheque_tx_id,
        v_voucher_id
      );
    END LOOP;
  END IF;

  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    v_alloc_result := public.allocate_voucher_to_invoices_atomic(
      p_user_id, NULL, v_primary_tx_id, v_total, p_allocations, false
    );
    IF NOT (v_alloc_result->>'success')::boolean THEN
      RAISE EXCEPTION 'allocation failed: %', v_alloc_result->>'error';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'voucher_id', v_voucher_id,
    'transaction_id', v_primary_tx_id,
    'cash_transaction_id', v_cash_tx_id,
    'cheque_transaction_id', v_cheque_tx_id,
    'reference', v_ref,
    'total', v_total,
    'cash_amount', p_cash_amount,
    'cheques_amount', v_cheques_total,
    'idempotency_key', v_idem
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;