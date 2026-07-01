
CREATE OR REPLACE FUNCTION public.create_mixed_voucher_atomic(
  p_user_id uuid,
  p_kind text,                    -- 'receipt' | 'payment'
  p_contact_id uuid,
  p_contact_name text,
  p_voucher_date date,
  p_currency text DEFAULT 'شيكل',
  p_exchange_rate numeric DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_cash_amount numeric DEFAULT 0,
  p_cash_account_code text DEFAULT NULL,   -- '1110' or '1120'
  p_cheques jsonb DEFAULT '[]'::jsonb,     -- [{number,date,bank,amount,account_number,notes}]
  p_allocations jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL,
  p_workshop_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL
)
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

  -- Idempotency check (any of the child rows would carry this prefix)
  SELECT id INTO v_existing FROM public.transactions
    WHERE user_id = p_user_id
      AND (idempotency_key = v_idem OR idempotency_key = v_idem || '-CASH' OR idempotency_key = v_idem || '-CHQ')
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  -- Sum cheques
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

  -- Account roles per kind
  IF p_kind = 'receipt' THEN
    v_tx_type := 'receipt';
    v_cheque_acct := '1150';   -- شيكات برسم التحصيل
    v_contact_acct := CASE WHEN p_employee_id IS NOT NULL THEN '1140' ELSE '1130' END;
    v_cash_acct := p_cash_account_code;
  ELSE
    v_tx_type := 'payment';
    v_cheque_acct := '1160';   -- شيكات دفع مستحقة (خصوم)
    v_contact_acct := CASE WHEN p_employee_id IS NOT NULL THEN '1140' ELSE '2110' END;
    v_cash_acct := p_cash_account_code;
  END IF;

  -- Validate postable
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

  -- CASH LEG
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
      CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
      CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_cash_amount ELSE NULL END,
      p_workshop_id, p_cost_center_id
    ) RETURNING id INTO v_cash_tx_id;
  END IF;

  -- CHEQUE LEG (aggregate one accounting row for all cheques)
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
      CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
      CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN v_cheques_total ELSE NULL END,
      p_workshop_id, p_cost_center_id
    ) RETURNING id INTO v_cheque_tx_id;

    -- Persist cheques
    FOR v_ch IN SELECT * FROM jsonb_array_elements(p_cheques) LOOP
      INSERT INTO public.cheques(
        user_id, cheque_type, status,
        cheque_number, bank_name, cheque_date, amount, currency,
        party_name, party_type, contact_id, linked_account,
        account_number, notes, linked_transaction_id
      ) VALUES (
        p_user_id,
        CASE WHEN p_kind='receipt' THEN 'وارد' ELSE 'صادر' END,
        'مسجل',
        COALESCE(v_ch->>'number',''),
        COALESCE(v_ch->>'bank',''),
        COALESCE(NULLIF(v_ch->>'date','')::date, v_date),
        COALESCE((v_ch->>'amount')::numeric, 0),
        COALESCE(p_currency,'شيكل'),
        COALESCE(p_contact_name,''),
        CASE WHEN p_kind='receipt' THEN 'عميل' ELSE 'مورد' END,
        p_contact_id,
        v_cheque_acct,
        NULLIF(v_ch->>'account_number',''),
        NULLIF(v_ch->>'notes',''),
        v_cheque_tx_id
      );
    END LOOP;
  END IF;

  v_primary_tx_id := COALESCE(v_cash_tx_id, v_cheque_tx_id);

  -- Allocations (against total voucher amount)
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

GRANT EXECUTE ON FUNCTION public.create_mixed_voucher_atomic(
  uuid,text,uuid,text,date,text,numeric,text,text,text,numeric,text,jsonb,jsonb,text,uuid,uuid,uuid
) TO authenticated;
