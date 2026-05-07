
-- ============================================================
-- Cheque endorsement integrity overhaul (read-safe migration)
-- 1) Add original_contact_id on cheques + backfill
-- 2) Auto-set original_contact_id on incoming cheque insert
-- 3) Harden create_cheque_lifecycle_event (endorse) — preserve original
-- 4) Harden cancel_cheque_endorsement — restore from original_contact_id
-- 5) Drop broken unendorse_cheque (uses non-existent column)
-- 6) Duplicate-endorsement guard
-- ============================================================

-- 1) Column
ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS original_contact_id uuid;

CREATE INDEX IF NOT EXISTS idx_cheques_original_contact_id
  ON public.cheques(original_contact_id) WHERE original_contact_id IS NOT NULL;

-- Backfill (read-safe): for inbound cheques copy current contact_id; if endorsed, attempt party_name lookup
UPDATE public.cheques c
SET original_contact_id = COALESCE(
  c.original_contact_id,
  CASE WHEN c.status <> 'مظهر' THEN c.contact_id ELSE NULL END,
  (SELECT id FROM public.contacts ct
    WHERE ct.user_id = c.user_id AND ct.contact_name = c.party_name
    LIMIT 1)
)
WHERE c.cheque_type = 'وارد' AND c.original_contact_id IS NULL;

-- 2) Trigger: auto-fill original_contact_id on insert/first link
CREATE OR REPLACE FUNCTION public.set_cheque_original_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NEW.cheque_type = 'وارد' AND NEW.original_contact_id IS NULL THEN
    NEW.original_contact_id := COALESCE(
      NEW.contact_id,
      (SELECT id FROM public.contacts
       WHERE user_id = NEW.user_id AND contact_name = NEW.party_name LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_cheque_original_contact ON public.cheques;
CREATE TRIGGER trg_set_cheque_original_contact
BEFORE INSERT OR UPDATE OF contact_id, party_name ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.set_cheque_original_contact();

-- 3) Harden lifecycle endorse: preserve original_contact_id; duplicate-endorse guard
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
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $function$
DECLARE
  v_cheque RECORD; v_existing uuid; v_tx_id uuid; v_fee_tx_id uuid;
  v_ref text; v_debit text; v_credit text; v_new_status text; v_tx_type text;
  v_desc text; v_contact_id uuid; v_active_endorse int;
BEGIN
  IF p_user_id IS NULL OR p_cheque_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'required params missing');
  END IF;
  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'cheque not found'); END IF;

  IF p_idempotency_key IS NULL THEN
    p_idempotency_key := 'CHQ-' || p_event || '-' || p_cheque_id::text || '-' || to_char(now(), 'YYYYMMDDHH24MISS');
  END IF;
  SELECT id INTO v_existing FROM public.transactions WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  v_ref := 'CHQ-' || COALESCE(v_cheque.cheque_number, p_cheque_id::text) || '-' || p_event;
  v_contact_id := v_cheque.contact_id;

  CASE p_event
    WHEN 'collect' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := p_bank_account_code; v_credit := '1125';
      v_new_status := 'محصل'; v_tx_type := 'cheque_collection';
      v_desc := 'تحصيل شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
    WHEN 'bounce' THEN
      v_debit := '1130';
      v_credit := CASE WHEN v_cheque.deposit_bank_account_id IS NOT NULL OR v_cheque.deposit_date IS NOT NULL THEN '1125' ELSE '1150' END;
      v_new_status := 'مرتجع'; v_tx_type := 'cheque_bounce';
      v_desc := 'شيك مرتجع - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');
    WHEN 'endorse' THEN
      -- Duplicate-endorse guard
      SELECT count(*) INTO v_active_endorse
      FROM public.cheque_status_history h
      WHERE h.cheque_id = p_cheque_id AND h.action_type = 'endorse'
        AND NOT EXISTS (
          SELECT 1 FROM public.cheque_status_history h2
          WHERE h2.cheque_id = p_cheque_id AND h2.action_type = 'unendorse'
            AND h2.created_at > h.created_at
        );
      IF v_active_endorse > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'الشيك مظهَّر مسبقاً. ألغِ التجيير الحالي قبل تجييره مجدداً.');
      END IF;
      IF p_endorsed_to_contact_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'تجيير الشيك يتطلب اختيار المورد المظهَّر إليه (contact_id).');
      END IF;
      -- Preserve original
      IF v_cheque.original_contact_id IS NULL AND v_cheque.contact_id IS NOT NULL THEN
        UPDATE public.cheques SET original_contact_id = v_cheque.contact_id WHERE id = p_cheque_id;
      END IF;
      v_debit := '2110'; v_credit := COALESCE(v_cheque.linked_account, '1150');
      v_new_status := 'مظهر'; v_tx_type := 'cheque_endorsement';
      v_desc := 'تظهير شيك - ' || COALESCE(v_cheque.party_name, '');
      v_contact_id := p_endorsed_to_contact_id;
    WHEN 'cancel' THEN
      UPDATE public.cheques SET status = 'ملغي', updated_at = now() WHERE id = p_cheque_id;
      BEGIN
        INSERT INTO public.cheque_status_history(cheque_id, user_id, from_status, to_status, action_type, reason, linked_transaction_id, details)
        VALUES (p_cheque_id, p_user_id, v_cheque.status, 'ملغي'::cheque_status, 'cancel', p_reason, NULL, jsonb_build_object('event_date', p_event_date, 'notes', p_notes));
      EXCEPTION WHEN OTHERS THEN NULL; END;
      RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', NULL, 'reference', v_ref, 'status_only', true);
    WHEN 'pay_outbound' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := '1160'; v_credit := p_bank_account_code;
      v_new_status := 'مصروف'; v_tx_type := 'cheque_cashed';
      v_desc := 'صرف شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
    WHEN 'register' THEN
      IF v_cheque.cheque_type = 'وارد' THEN
        v_debit := '1150'; v_credit := COALESCE(v_cheque.linked_account, '1130');
        v_desc := 'تسجيل شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
      ELSE
        v_debit := COALESCE(v_cheque.linked_account, '2110'); v_credit := '1160';
        v_desc := 'تسجيل شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
      END IF;
      v_new_status := v_cheque.status::text; v_tx_type := 'cheque_register';
    WHEN 'deposit' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := '1125'; v_credit := '1150';
      v_new_status := 'مودع'; v_tx_type := 'cheque_deposit';
      v_desc := 'إيداع شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
    WHEN 'cashed' THEN
      v_debit := '1160'; v_credit := COALESCE(p_bank_account_code, v_cheque.linked_account, '1120');
      v_new_status := 'مصروف'; v_tx_type := 'cheque_cashed';
      v_desc := 'صرف شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
    WHEN 'outgoing_bounced' THEN
      v_debit := '1160'; v_credit := '2110';
      v_new_status := 'مرتجع'; v_tx_type := 'cheque_bounce';
      v_desc := 'شيك صادر مرتجع - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');
    WHEN 'recover' THEN
      v_debit := '1160'; v_credit := '2110';
      v_new_status := 'ملغي'; v_tx_type := 'cheque_recover';
      v_desc := 'استرداد شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');
    WHEN 'return_to_customer' THEN
      v_debit := '1130'; v_credit := '1150';
      v_new_status := 'مرتجع'; v_tx_type := 'cheque_return';
      v_desc := 'إرجاع شيك للزبون - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');
    WHEN 'cancel_with_reverse' THEN
      IF v_cheque.cheque_type = 'وارد' THEN v_debit := '1130'; v_credit := '1150';
      ELSE v_debit := '1160'; v_credit := '2110'; END IF;
      v_new_status := 'ملغي'; v_tx_type := 'cheque_cancel';
      v_desc := 'إلغاء شيك ' || v_cheque.cheque_type || ' - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'unknown event: ' || p_event);
  END CASE;

  BEGIN
    PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
    PERFORM public._fc_validate_postable_account(p_user_id, v_credit);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code, amount, currency, transaction_type, reference, idempotency_key, contact_id, payment_method, notes, exchange_rate, foreign_amount)
  VALUES (p_user_id, p_event_date, v_desc, v_debit, v_credit, v_cheque.amount, COALESCE(v_cheque.currency, 'شيكل'), v_tx_type, v_ref, p_idempotency_key, v_contact_id, 'cheque', p_notes,
          CASE WHEN COALESCE(v_cheque.currency, 'شيكل') <> 'شيكل' THEN 1 ELSE NULL END,
          CASE WHEN COALESCE(v_cheque.currency, 'شيكل') <> 'شيكل' THEN v_cheque.amount ELSE NULL END)
  RETURNING id INTO v_tx_id;

  IF p_bank_fees IS NOT NULL AND p_bank_fees > 0 THEN
    INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code, amount, currency, transaction_type, reference, idempotency_key, contact_id, payment_method, notes)
    VALUES (p_user_id, p_event_date, 'رسوم بنكية - شيك ' || COALESCE(v_cheque.cheque_number, ''),
            COALESCE(p_bank_fees_account_code, '5200'), COALESCE(p_bank_account_code, '1120'),
            p_bank_fees, 'شيكل', 'bank_fee', v_ref || '-FEE', p_idempotency_key || '-FEE',
            v_contact_id, 'cheque', 'رسوم مرتبطة بـ ' || p_event)
    RETURNING id INTO v_fee_tx_id;
  END IF;

  UPDATE public.cheques
  SET status = v_new_status::cheque_status,
      linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
      contact_id = CASE WHEN p_event='endorse' THEN p_endorsed_to_contact_id ELSE contact_id END,
      endorsed_to_contact_id = CASE WHEN p_event='endorse' THEN p_endorsed_to_contact_id ELSE endorsed_to_contact_id END,
      endorsed_at = CASE WHEN p_event='endorse' THEN now() ELSE endorsed_at END,
      endorsement_voucher_id = CASE WHEN p_event='endorse' THEN v_tx_id ELSE endorsement_voucher_id END,
      updated_at = now()
  WHERE id = p_cheque_id;

  BEGIN
    INSERT INTO public.cheque_status_history(cheque_id, user_id, from_status, to_status, action_type, reason, linked_transaction_id, details)
    VALUES (p_cheque_id, p_user_id, v_cheque.status, v_new_status::cheque_status, p_event, p_reason, v_tx_id,
            jsonb_build_object('event_date', p_event_date, 'notes', p_notes, 'bank_fees', p_bank_fees, 'fee_tx_id', v_fee_tx_id,
              'endorsed_to_contact_id', CASE WHEN p_event='endorse' THEN p_endorsed_to_contact_id ELSE NULL END));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', v_tx_id, 'fee_transaction_id', v_fee_tx_id, 'reference', v_ref, 'new_status', v_new_status);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 4) Harden cancel_cheque_endorsement — restore from original_contact_id
CREATE OR REPLACE FUNCTION public.cancel_cheque_endorsement(p_user_id uuid, p_cheque_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $function$
DECLARE
  v_cheque RECORD; v_endorse_tx RECORD; v_reverse_tx_id uuid;
  v_subsequent_count int; v_restore_contact_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_cheque_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'المعاملات الأساسية مفقودة');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'سبب إلغاء التجيير مطلوب (3 أحرف على الأقل)');
  END IF;

  SELECT * INTO v_cheque FROM public.cheques
  WHERE id = p_cheque_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'الشيك غير موجود'); END IF;

  IF v_cheque.status <> 'مظهر' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء التجيير: حالة الشيك "' || v_cheque.status || '". يجب أن تكون "مظهر".');
  END IF;

  -- Subsequent activity guard
  SELECT count(*) INTO v_subsequent_count
  FROM public.cheque_status_history
  WHERE cheque_id = p_cheque_id
    AND action_type IN ('collect','bounce','return_to_customer','cancel','cancel_with_reverse','cashed','pay_outbound','deposit')
    AND created_at > COALESCE(
      (SELECT max(created_at) FROM public.cheque_status_history
       WHERE cheque_id = p_cheque_id AND action_type = 'endorse'),
      v_cheque.created_at);
  IF v_subsequent_count > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء التجيير لوجود حركة لاحقة على الشيك (تحصيل/إيداع/مرتجع/إلغاء). تراجع عنها أولاً.');
  END IF;

  SELECT t.* INTO v_endorse_tx
  FROM public.transactions t
  JOIN public.cheque_status_history h ON h.linked_transaction_id = t.id
  WHERE h.cheque_id = p_cheque_id AND h.action_type = 'endorse'
    AND t.is_deleted = false
    AND NOT EXISTS (SELECT 1 FROM public.transactions r WHERE r.reversed_by_id = t.id)
  ORDER BY t.created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على قيد التجيير الأصلي أو أنه عُكس مسبقاً.');
  END IF;

  v_reverse_tx_id := public.create_reverse_entry(
    v_endorse_tx.id,
    'إلغاء تجيير شيك #' || COALESCE(v_cheque.cheque_number, '') || ' — السبب: ' || p_reason,
    p_user_id);

  -- Restore contact_id strictly from original_contact_id (no name lookup)
  v_restore_contact_id := v_cheque.original_contact_id;

  PERFORM set_config('app.cheque_unendorse', 'true', true);
  UPDATE public.cheques
  SET status = 'مسجل'::cheque_status,
      endorsed_to_contact_id = NULL,
      endorsed_to_name = NULL,
      endorsed_at = NULL,
      endorsement_voucher_id = NULL,
      endorsement_notes = NULL,
      contact_id = v_restore_contact_id,
      updated_at = now()
  WHERE id = p_cheque_id;
  PERFORM set_config('app.cheque_unendorse', 'false', true);

  BEGIN
    INSERT INTO public.cheque_status_history(cheque_id, user_id, from_status, to_status, action_type, reason, linked_transaction_id, details)
    VALUES (p_cheque_id, p_user_id, 'مظهر'::cheque_status, 'مسجل'::cheque_status, 'unendorse', p_reason, v_reverse_tx_id,
      jsonb_build_object('original_endorsement_tx_id', v_endorse_tx.id,
                        'reverse_tx_id', v_reverse_tx_id,
                        'restored_contact_id', v_restore_contact_id,
                        'previous_endorsed_to', v_cheque.endorsed_to_name,
                        'event_date', CURRENT_DATE));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id,
    'new_status', 'مسجل', 'restored_contact_id', v_restore_contact_id,
    'original_tx_id', v_endorse_tx.id, 'reverse_tx_id', v_reverse_tx_id);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.cheque_unendorse', 'false', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 5) Drop broken duplicate (refers to non-existent column reverse_of_transaction_id)
DROP FUNCTION IF EXISTS public.unendorse_cheque(uuid, uuid, text);
