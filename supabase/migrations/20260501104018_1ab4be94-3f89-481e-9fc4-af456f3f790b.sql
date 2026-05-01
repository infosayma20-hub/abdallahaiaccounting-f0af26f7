CREATE OR REPLACE FUNCTION public.create_cheque_lifecycle_event(
  p_user_id uuid, p_cheque_id uuid, p_event text,
  p_event_date date DEFAULT CURRENT_DATE,
  p_bank_account_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_bank_fees numeric DEFAULT NULL,
  p_bank_fees_account_code text DEFAULT '5200',
  p_endorsed_to_contact_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cheque RECORD;
  v_existing uuid;
  v_tx_id uuid;
  v_fee_tx_id uuid;
  v_ref text;
  v_debit text; v_credit text;
  v_new_status text;
  v_tx_type text;
  v_desc text;
  v_contact_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_cheque_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'required params missing');
  END IF;

  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cheque not found');
  END IF;

  IF p_idempotency_key IS NULL THEN
    p_idempotency_key := 'CHQ-' || p_event || '-' || p_cheque_id::text || '-' || to_char(now(), 'YYYYMMDDHH24MISS');
  END IF;

  SELECT id INTO v_existing
  FROM public.transactions
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, p_cheque_id::text) || '-' || p_event;
  v_contact_id := v_cheque.contact_id;

  CASE p_event
    WHEN 'collect' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := p_bank_account_code; v_credit := '1125';
      v_new_status := 'محصل';
      v_tx_type := 'cheque_collection';
      v_desc := 'تحصيل شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'bounce' THEN
      -- FIX: do NOT use linked_account (often = 1130 = AR which causes debit=credit).
      -- Always credit the inbound cheques control account (1150 register, 1125 in collection).
      v_debit := '1130';
      v_credit := CASE WHEN v_cheque.deposit_bank_account_id IS NOT NULL OR v_cheque.deposit_date IS NOT NULL THEN '1125' ELSE '1150' END;
      v_new_status := 'مرتجع';
      v_tx_type := 'cheque_bounce';
      v_desc := 'شيك مرتجع - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'endorse' THEN
      v_debit := '2110'; v_credit := COALESCE(v_cheque.linked_account, '1150');
      v_new_status := 'مظهر';
      v_tx_type := 'cheque_endorsement';
      v_desc := 'تظهير شيك - ' || COALESCE(v_cheque.party_name, '');
      IF p_endorsed_to_contact_id IS NOT NULL THEN
        v_contact_id := p_endorsed_to_contact_id;
      END IF;

    WHEN 'cancel' THEN
      UPDATE public.cheques SET status = 'ملغي', updated_at = now() WHERE id = p_cheque_id;
      RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', NULL, 'reference', v_ref, 'status_only', true);

    WHEN 'pay_outbound' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := '1160'; v_credit := p_bank_account_code;
      v_new_status := 'مصروف';  -- FIX: enum value is مصروف, not مدفوع
      v_tx_type := 'cheque_cashed';
      v_desc := 'صرف شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'register' THEN
      IF v_cheque.cheque_type = 'وارد' THEN
        v_debit := '1150'; v_credit := COALESCE(v_cheque.linked_account, '1130');
        v_desc := 'تسجيل شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
      ELSE
        v_debit := COALESCE(v_cheque.linked_account, '2110'); v_credit := '1160';
        v_desc := 'تسجيل شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
      END IF;
      v_new_status := v_cheque.status::text;
      v_tx_type := 'cheque_register';

    WHEN 'deposit' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := '1125'; v_credit := '1150';
      v_new_status := 'مودع';
      v_tx_type := 'cheque_deposit';
      v_desc := 'إيداع شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'cashed' THEN
      v_debit := '1160';
      v_credit := COALESCE(p_bank_account_code, v_cheque.linked_account, '1120');
      v_new_status := 'مصروف';  -- FIX: was 'مدفوع' (not in enum)
      v_tx_type := 'cheque_cashed';
      v_desc := 'صرف شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'outgoing_bounced' THEN
      v_debit := '1160'; v_credit := '2110';
      v_new_status := 'مرتجع';
      v_tx_type := 'cheque_bounce';
      v_desc := 'شيك صادر مرتجع - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'recover' THEN
      v_debit := '1160'; v_credit := '2110';
      v_new_status := 'ملغي';
      v_tx_type := 'cheque_recover';
      v_desc := 'استرداد شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'return_to_customer' THEN
      v_debit := '1130'; v_credit := '1150';
      v_new_status := 'مرتجع';
      v_tx_type := 'cheque_return';
      v_desc := 'إرجاع شيك للزبون - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'cancel_with_reverse' THEN
      IF v_cheque.cheque_type = 'وارد' THEN
        v_debit := '1130'; v_credit := '1150';
      ELSE
        v_debit := '1160'; v_credit := '2110';
      END IF;
      v_new_status := 'ملغي';
      v_tx_type := 'cheque_cancel';
      v_desc := 'إلغاء شيك ' || v_cheque.cheque_type || ' - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'unknown event: ' || p_event);
  END CASE;

  BEGIN
    PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
    PERFORM public._fc_validate_postable_account(p_user_id, v_credit);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount
  ) VALUES (
    p_user_id, p_event_date, v_desc,
    v_debit, v_credit, v_cheque.amount, COALESCE(v_cheque.currency, 'شيكل'),
    v_tx_type, v_ref, p_idempotency_key,
    v_contact_id, 'cheque', p_notes,
    CASE WHEN COALESCE(v_cheque.currency, 'شيكل') <> 'شيكل' THEN 1 ELSE NULL END,
    CASE WHEN COALESCE(v_cheque.currency, 'شيكل') <> 'شيكل' THEN v_cheque.amount ELSE NULL END
  ) RETURNING id INTO v_tx_id;

  IF p_bank_fees IS NOT NULL AND p_bank_fees > 0 THEN
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, notes
    ) VALUES (
      p_user_id, p_event_date,
      'رسوم بنكية - شيك ' || COALESCE(v_cheque.cheque_number, ''),
      COALESCE(p_bank_fees_account_code, '5200'),
      COALESCE(p_bank_account_code, '1120'),
      p_bank_fees, 'شيكل',
      'bank_fee', v_ref || '-FEE',
      p_idempotency_key || '-FEE',
      v_contact_id, 'cheque', 'رسوم مرتبطة بـ ' || p_event
    ) RETURNING id INTO v_fee_tx_id;
  END IF;

  UPDATE public.cheques
  SET status = v_new_status::cheque_status,
      linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
      updated_at = now()
  WHERE id = p_cheque_id;

  BEGIN
    INSERT INTO public.cheque_status_history(
      cheque_id, user_id, from_status, to_status, action_type, reason, linked_transaction_id, notes
    ) VALUES (
      p_cheque_id, p_user_id, v_cheque.status, v_new_status::cheque_status,
      p_event, p_reason, v_tx_id, p_notes
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'transaction_id', v_tx_id,
    'fee_transaction_id', v_fee_tx_id,
    'reference', v_ref,
    'new_status', v_new_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;