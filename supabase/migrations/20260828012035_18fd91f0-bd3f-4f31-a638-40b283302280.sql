-- ============ Offline finance posting (idempotent) ============

ALTER TABLE public.cheques ADD COLUMN IF NOT EXISTS local_id text;
CREATE UNIQUE INDEX IF NOT EXISTS cheques_user_local_id_uidx
  ON public.cheques (user_id, local_id) WHERE local_id IS NOT NULL;

-- ---------- RECEIPT VOUCHER ----------
CREATE OR REPLACE FUNCTION public.create_receipt_voucher_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid; v_existing_num text;
  v_amount numeric; v_date date; v_year int;
  v_res jsonb; v_tx uuid; v_num text; v_max int; v_id uuid;
  v_attempt int := 0;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;
  IF auth.uid() IS NULL OR (p_user_id <> auth.uid() AND p_user_id <> public.get_team_owner_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT id, receipt_number INTO v_existing_id, v_existing_num
    FROM public.receipt_vouchers
   WHERE user_id = p_user_id AND local_id = p_idempotency_key LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'id', v_existing_id, 'receipt_number', v_existing_num);
  END IF;

  v_amount := (p_payload->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: amount');
  END IF;
  v_date := COALESCE((p_payload->>'voucher_date')::date, CURRENT_DATE);
  v_year := EXTRACT(YEAR FROM v_date)::int;

  v_res := public.create_receipt_with_entry(
    p_user_id            => p_user_id,
    p_contact_id         => NULLIF(p_payload->>'contact_id','')::uuid,
    p_contact_name       => p_payload->>'contact_name',
    p_amount             => v_amount,
    p_payment_method     => COALESCE(p_payload->>'payment_method','نقدي'),
    p_description        => p_payload->>'description',
    p_currency           => COALESCE(p_payload->>'currency','شيكل'),
    p_idempotency_key    => p_idempotency_key,
    p_voucher_date       => v_date,
    p_exchange_rate      => NULL,
    p_reference          => NULL,
    p_cash_account_code  => NULLIF(p_payload->>'cash_account_code',''),
    p_contact_account_code => NULL,
    p_notes              => NULLIF(p_payload->>'notes',''),
    p_employee_id        => NULL,
    p_workshop_id        => NULLIF(p_payload->>'workshop_id','')::uuid,
    p_allocations        => NULL,
    p_cost_center_id     => NULLIF(p_payload->>'cost_center_id','')::uuid
  );

  IF COALESCE((v_res->>'success')::boolean, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(v_res->>'error','فشل إنشاء القيد'));
  END IF;
  v_tx := (v_res->>'transaction_id')::uuid;

  LOOP
    SELECT COALESCE(MAX((regexp_replace(receipt_number, '^.*-', ''))::int), 0)
      INTO v_max
      FROM public.receipt_vouchers
     WHERE user_id = p_user_id
       AND receipt_number ~ ('^REC-' || v_year || '-[0-9]+$');
    v_num := 'REC-' || v_year || '-' || lpad((v_max + 1 + v_attempt)::text, 4, '0');
    BEGIN
      INSERT INTO public.receipt_vouchers(
        user_id, local_id, receipt_number, contact_id, contact_name, payment_date,
        amount, payment_method, cash_box_id, bank_account_id, deposit_account_code,
        notes, status, linked_transaction_id
      ) VALUES (
        p_user_id, p_idempotency_key, v_num,
        NULLIF(p_payload->>'contact_id','')::uuid,
        COALESCE(p_payload->>'contact_name',''),
        v_date, v_amount, COALESCE(p_payload->>'payment_method','نقدي'),
        NULLIF(p_payload->>'cash_box_id','')::uuid,
        NULLIF(p_payload->>'bank_account_id','')::uuid,
        NULLIF(p_payload->>'cash_account_code',''),
        NULLIF(p_payload->>'notes',''), 'posted', v_tx
      ) RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt > 8 THEN
        RAISE EXCEPTION 'تعذر تخصيص رقم سند قبض فريد';
      END IF;
    END;
  END LOOP;

  UPDATE public.transactions SET reference = v_num WHERE id = v_tx AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false,
    'id', v_id, 'receipt_number', v_num, 'transaction_id', v_tx);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------- PAYMENT VOUCHER ----------
CREATE OR REPLACE FUNCTION public.create_payment_voucher_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid; v_existing_num text;
  v_amount numeric; v_date date; v_year int;
  v_res jsonb; v_tx uuid; v_num text; v_max int; v_id uuid;
  v_attempt int := 0; v_method text;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;
  IF auth.uid() IS NULL OR (p_user_id <> auth.uid() AND p_user_id <> public.get_team_owner_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT id, ref_number INTO v_existing_id, v_existing_num
    FROM public.vouchers
   WHERE user_id = p_user_id AND local_id = p_idempotency_key LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'id', v_existing_id, 'ref_number', v_existing_num);
  END IF;

  v_amount := (p_payload->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: amount');
  END IF;
  v_date := COALESCE((p_payload->>'voucher_date')::date, CURRENT_DATE);
  v_year := EXTRACT(YEAR FROM v_date)::int;
  v_method := COALESCE(p_payload->>'payment_method','نقدي');

  v_res := public.create_payment_with_entry(
    p_user_id            => p_user_id,
    p_contact_id         => NULLIF(p_payload->>'contact_id','')::uuid,
    p_contact_name       => p_payload->>'contact_name',
    p_amount             => v_amount,
    p_payment_method     => v_method,
    p_description        => p_payload->>'description',
    p_currency           => COALESCE(p_payload->>'currency','شيكل'),
    p_idempotency_key    => p_idempotency_key,
    p_voucher_date       => v_date,
    p_exchange_rate      => NULL,
    p_reference          => NULL,
    p_cash_account_code  => NULLIF(p_payload->>'cash_account_code',''),
    p_contact_account_code => NULL,
    p_notes              => NULLIF(p_payload->>'notes',''),
    p_employee_id        => NULL,
    p_workshop_id        => NULLIF(p_payload->>'workshop_id','')::uuid,
    p_allocations        => NULL,
    p_cost_center_id     => NULLIF(p_payload->>'cost_center_id','')::uuid
  );

  IF COALESCE((v_res->>'success')::boolean, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(v_res->>'error','فشل إنشاء القيد'));
  END IF;
  v_tx := (v_res->>'transaction_id')::uuid;

  LOOP
    SELECT COALESCE(MAX((regexp_replace(ref_number, '^.*-', ''))::int), 0)
      INTO v_max
      FROM public.vouchers
     WHERE user_id = p_user_id AND type = 'payment'
       AND ref_number ~ ('^PV-' || v_year || '-[0-9]+$');
    v_num := 'PV-' || v_year || '-' || lpad((v_max + 1 + v_attempt)::text, 4, '0');
    BEGIN
      INSERT INTO public.vouchers(
        user_id, local_id, type, ref_number, doc_date, contact_id, payment_method,
        amount, amount_ils, currency, exchange_rate, description, notes, status,
        linked_transaction_id, cash_box_id, bank_account_id, cost_center_id,
        posted_by, posted_at
      ) VALUES (
        p_user_id, p_idempotency_key, 'payment', v_num, v_date,
        NULLIF(p_payload->>'contact_id','')::uuid,
        CASE v_method WHEN 'بنك' THEN 'transfer' WHEN 'تحويل' THEN 'transfer'
                      WHEN 'بطاقة' THEN 'card' ELSE 'cash' END,
        v_amount, v_amount, 'ILS', 1,
        COALESCE(p_payload->>'description', 'سند صرف'),
        NULLIF(p_payload->>'notes',''), 'posted', v_tx,
        NULLIF(p_payload->>'cash_box_id','')::uuid,
        NULLIF(p_payload->>'bank_account_id','')::uuid,
        NULLIF(p_payload->>'cost_center_id','')::uuid,
        auth.uid(), now()
      ) RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt > 8 THEN
        RAISE EXCEPTION 'تعذر تخصيص رقم سند صرف فريد';
      END IF;
    END;
  END LOOP;

  UPDATE public.transactions SET reference = v_num WHERE id = v_tx AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false,
    'id', v_id, 'ref_number', v_num, 'transaction_id', v_tx);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------- CHEQUE REGISTRATION ----------
CREATE OR REPLACE FUNCTION public.create_cheque_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid; v_id uuid; v_amount numeric; v_date date;
  v_type text; v_status public.cheque_status; v_contact uuid;
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;
  IF auth.uid() IS NULL OR (p_user_id <> auth.uid() AND p_user_id <> public.get_team_owner_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT id INTO v_existing FROM public.cheques
   WHERE user_id = p_user_id AND local_id = p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'id', v_existing);
  END IF;

  v_amount := (p_payload->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: amount');
  END IF;
  v_type := COALESCE(p_payload->>'cheque_type', 'وارد');
  v_date := COALESCE((p_payload->>'cheque_date')::date, CURRENT_DATE);
  v_status := CASE WHEN v_date > CURRENT_DATE THEN 'آجل' ELSE 'مستحق' END::public.cheque_status;
  v_contact := NULLIF(p_payload->>'contact_id','')::uuid;

  INSERT INTO public.cheques(
    user_id, local_id, cheque_type, status, cheque_number, bank_name, cheque_date,
    amount, currency, party_name, party_type, notes, contact_id,
    source_bank_account_id, account_number, linked_account
  ) VALUES (
    p_user_id, p_idempotency_key, v_type::public.cheque_type, v_status,
    NULLIF(p_payload->>'cheque_number',''), NULLIF(p_payload->>'bank_name',''), v_date,
    v_amount, COALESCE(p_payload->>'currency','ILS'),
    COALESCE(p_payload->>'party_name',''), NULLIF(p_payload->>'party_type',''),
    NULLIF(p_payload->>'notes',''), v_contact,
    NULLIF(p_payload->>'source_bank_account_id','')::uuid,
    NULLIF(p_payload->>'account_number',''),
    NULLIF(p_payload->>'linked_account','')
  ) RETURNING id INTO v_id;

  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id, reference, idempotency_key
  ) VALUES (
    p_user_id, v_date,
    'تسجيل شيك ' || v_type || ' - ' || COALESCE(p_payload->>'party_name','') ||
      ' #' || COALESCE(p_payload->>'cheque_number',''),
    CASE WHEN v_type = 'وارد' THEN '1150' ELSE '2110' END,
    CASE WHEN v_type = 'وارد' THEN '1130' ELSE '1160' END,
    v_amount, COALESCE(p_payload->>'currency_label','شيكل'),
    'cheque_register', v_contact,
    'CHQ-REG-' || left(v_id::text, 8), 'CHQ-REG-' || v_id::text
  );

  INSERT INTO public.cheque_status_history(cheque_id, user_id, from_status, to_status, action_type)
  VALUES (v_id, p_user_id, NULL, v_status, 'register');

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'id', v_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------- CASH TRANSFER (offline wrapper) ----------
CREATE OR REPLACE FUNCTION public.create_cash_transfer_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;
  IF auth.uid() IS NULL OR (p_user_id <> auth.uid() AND p_user_id <> public.get_team_owner_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  RETURN public.create_cash_transfer_atomic(
    p_user_id           => p_user_id,
    p_from_account_code => p_payload->>'from_account_code',
    p_to_account_code   => p_payload->>'to_account_code',
    p_amount            => (p_payload->>'amount')::numeric,
    p_currency          => COALESCE(p_payload->>'currency','شيكل'),
    p_transfer_date     => COALESCE((p_payload->>'transfer_date')::date, CURRENT_DATE),
    p_description       => p_payload->>'description',
    p_idempotency_key   => p_idempotency_key,
    p_source            => COALESCE(p_payload->>'source','manual'),
    p_from_box_id       => NULLIF(p_payload->>'from_box_id','')::uuid,
    p_to_box_id         => NULLIF(p_payload->>'to_box_id','')::uuid,
    p_exchange_rate     => COALESCE((p_payload->>'exchange_rate')::numeric, 1),
    p_foreign_amount    => NULLIF(p_payload->>'foreign_amount','')::numeric
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_receipt_voucher_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_voucher_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cheque_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cash_transfer_offline(uuid, jsonb, text) TO authenticated;