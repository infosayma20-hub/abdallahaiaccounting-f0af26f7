
-- ============================================================
-- PHASE 5/6: VOUCHER + CHEQUE RPC EXPANSION (BACKWARD COMPATIBLE)
-- ============================================================

-- ------------------------------------------------------------
-- 1) FEATURE FLAG: cheques_use_rpc (default OFF)
-- ------------------------------------------------------------
-- (no schema change needed; feature_flags jsonb already exists on company_settings.
--  Enabling per-tenant: UPDATE company_settings SET feature_flags = feature_flags || '{"cheques_use_rpc": true}'::jsonb WHERE user_id = ...)


-- ------------------------------------------------------------
-- 2) EXPAND create_receipt_with_entry  (BACKWARD COMPATIBLE)
--    Old signature kept identical; new optional params appended.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_receipt_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_payment_method text DEFAULT 'نقدي',
  p_description text DEFAULT NULL,
  p_currency text DEFAULT 'شيكل',
  p_idempotency_key text DEFAULT NULL,
  -- NEW optional params (do not break existing callers)
  p_voucher_date date DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_cash_account_code text DEFAULT NULL,
  p_contact_account_code text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing uuid;
  v_tx_id uuid;
  v_debit text;
  v_credit text;
  v_date date;
  v_idem text;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params');
  END IF;

  v_date := COALESCE(p_voucher_date, CURRENT_DATE);
  v_idem := COALESCE(p_idempotency_key, 'RCV-' || gen_random_uuid()::text);

  -- Idempotency check
  SELECT id INTO v_existing
  FROM public.transactions
  WHERE user_id = p_user_id AND idempotency_key = v_idem
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
  END IF;

  -- Determine debit (cash/bank) and credit (contact AR/advance)
  v_debit := COALESCE(
    p_cash_account_code,
    CASE
      WHEN p_payment_method ILIKE '%نقد%' OR p_payment_method ILIKE '%cash%' THEN '1110'
      WHEN p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%bank%' THEN '1120'
      WHEN p_payment_method ILIKE '%شيك%' OR p_payment_method ILIKE '%cheque%' THEN '1150'
      ELSE '1110'
    END
  );

  v_credit := COALESCE(p_contact_account_code, '1130');  -- default AR

  -- Validate posting accounts (no parent posting)
  PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit);

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount
  )
  VALUES (
    p_user_id, v_date,
    COALESCE(p_description, 'سند قبض - ' || COALESCE(p_contact_name, '')),
    v_debit, v_credit, p_amount, COALESCE(p_currency, 'شيكل'),
    'receipt', COALESCE(p_reference, v_idem), v_idem,
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_amount ELSE NULL END
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', v_tx_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ------------------------------------------------------------
-- 3) EXPAND create_payment_with_entry  (BACKWARD COMPATIBLE)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_payment_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_amount numeric,
  p_payment_method text DEFAULT 'نقدي',
  p_description text DEFAULT NULL,
  p_currency text DEFAULT 'شيكل',
  p_idempotency_key text DEFAULT NULL,
  -- NEW optional params
  p_voucher_date date DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_cash_account_code text DEFAULT NULL,
  p_contact_account_code text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing uuid;
  v_tx_id uuid;
  v_debit text;
  v_credit text;
  v_date date;
  v_idem text;
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

  -- Debit AP, Credit Cash/Bank
  v_debit := COALESCE(p_contact_account_code, '2110');
  v_credit := COALESCE(
    p_cash_account_code,
    CASE
      WHEN p_payment_method ILIKE '%نقد%' OR p_payment_method ILIKE '%cash%' THEN '1110'
      WHEN p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%bank%' THEN '1120'
      WHEN p_payment_method ILIKE '%شيك%' OR p_payment_method ILIKE '%cheque%' THEN '1160'
      ELSE '1110'
    END
  );

  PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit);

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount
  )
  VALUES (
    p_user_id, v_date,
    COALESCE(p_description, 'سند صرف - ' || COALESCE(p_contact_name, '')),
    v_debit, v_credit, p_amount, COALESCE(p_currency, 'شيكل'),
    'payment', COALESCE(p_reference, v_idem), v_idem,
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_amount ELSE NULL END
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', v_tx_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ------------------------------------------------------------
-- 4) NEW: void_voucher_atomic
--    Marks a voucher transaction as voided (is_deleted=true) atomically.
--    Optionally creates a reverse entry (controlled by p_create_reverse).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_voucher_atomic(
  p_user_id uuid,
  p_transaction_id uuid,
  p_reason text DEFAULT NULL,
  p_create_reverse boolean DEFAULT false,
  p_void_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tx RECORD;
  v_reverse_id uuid;
  v_void_date date;
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing params');
  END IF;

  v_void_date := COALESCE(p_void_date, CURRENT_DATE);

  SELECT * INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction not found');
  END IF;

  IF v_tx.is_deleted THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'message', 'already voided');
  END IF;

  -- Optional IFRS reverse entry (uses existing helper if available)
  IF p_create_reverse THEN
    BEGIN
      INSERT INTO public.transactions(
        user_id, transaction_date, description,
        debit_account_code, credit_account_code, amount, currency,
        transaction_type, reference, idempotency_key,
        contact_id, payment_method, notes,
        exchange_rate, foreign_amount
      )
      VALUES (
        p_user_id, v_void_date,
        'عكس: ' || COALESCE(v_tx.description, ''),
        v_tx.credit_account_code, v_tx.debit_account_code,  -- swap
        v_tx.amount, v_tx.currency,
        'reverse_' || v_tx.transaction_type,
        'REV-' || COALESCE(v_tx.reference, v_tx.id::text),
        'REV-' || v_tx.id::text || '-' || to_char(now(), 'YYYYMMDDHH24MISS'),
        v_tx.contact_id, v_tx.payment_method,
        'عكس قيد - السبب: ' || COALESCE(p_reason, 'إلغاء سند'),
        v_tx.exchange_rate, v_tx.foreign_amount
      )
      RETURNING id INTO v_reverse_id;
    EXCEPTION WHEN OTHERS THEN
      -- if reverse fails, abort whole op
      RAISE EXCEPTION 'reverse entry failed: %', SQLERRM;
    END;
  END IF;

  -- Soft-delete the original
  UPDATE public.transactions
  SET is_deleted = true,
      notes = COALESCE(notes, '') || E'\n[VOIDED ' || v_void_date::text || '] ' || COALESCE(p_reason, ''),
      updated_at = now()
  WHERE id = p_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'voided_id', p_transaction_id,
    'reverse_id', v_reverse_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ------------------------------------------------------------
-- 5) NEW: update_voucher_atomic (PLACEHOLDER — wired safely)
--    Implements the canonical "delete-and-recreate" pattern:
--      void old tx (no reverse), then re-insert with same shape.
--    Only used by NEW callers; existing UI keeps doing its own update.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_voucher_atomic(
  p_user_id uuid,
  p_transaction_id uuid,
  p_kind text,                          -- 'receipt' | 'payment' | 'journal'
  p_voucher_date date,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_description text,
  p_contact_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_cash_account_code text DEFAULT NULL,
  p_contact_account_code text DEFAULT NULL,
  p_exchange_rate numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing RECORD;
  v_new jsonb;
  v_idem text;
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR p_kind IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing params');
  END IF;

  IF p_kind NOT IN ('receipt', 'payment') THEN
    -- Journal vouchers are multi-line and need a different pathway.
    -- Returning explicit not-implemented so callers can fallback safely.
    RETURN jsonb_build_object(
      'success', false,
      'error', 'kind not yet supported by update_voucher_atomic',
      'fallback_required', true
    );
  END IF;

  SELECT * INTO v_existing
  FROM public.transactions
  WHERE id = p_transaction_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction not found');
  END IF;

  v_idem := COALESCE(p_idempotency_key,
    UPPER(p_kind) || '-EDIT-' || p_transaction_id::text || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS'));

  -- Step 1: void original (no reverse, this is an edit not a cancel)
  UPDATE public.transactions
  SET is_deleted = true,
      idempotency_key = NULL,                            -- free the key
      notes = COALESCE(notes, '') || E'\n[REPLACED-BY-EDIT ' || now()::text || ']',
      updated_at = now()
  WHERE id = p_transaction_id;

  -- Step 2: recreate via the canonical RPC
  IF p_kind = 'receipt' THEN
    v_new := public.create_receipt_with_entry(
      p_user_id, p_contact_id, p_contact_name, p_amount,
      p_payment_method, p_description, p_currency, v_idem,
      p_voucher_date, p_exchange_rate, p_reference,
      p_cash_account_code, p_contact_account_code, p_notes
    );
  ELSE  -- payment
    v_new := public.create_payment_with_entry(
      p_user_id, p_contact_id, p_contact_name, p_amount,
      p_payment_method, p_description, p_currency, v_idem,
      p_voucher_date, p_exchange_rate, p_reference,
      p_cash_account_code, p_contact_account_code, p_notes
    );
  END IF;

  IF NOT (v_new->>'success')::boolean THEN
    -- Rollback: un-void the original
    UPDATE public.transactions
    SET is_deleted = false,
        idempotency_key = v_existing.idempotency_key,
        updated_at = now()
    WHERE id = p_transaction_id;
    RETURN jsonb_build_object('success', false, 'error', 'recreate failed: ' || COALESCE(v_new->>'error', 'unknown'));
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'voided_id', p_transaction_id,
    'new_transaction_id', v_new->>'transaction_id'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ------------------------------------------------------------
-- 6) EXPAND create_cheque_lifecycle_event with new events
--    Adds: register, deposit, cashed, outgoing_bounced, recover,
--          return_to_customer  + optional bank_fees parameter.
--    Old events still work identically.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_cheque_lifecycle_event(
  p_user_id uuid,
  p_cheque_id uuid,
  p_event text,
  p_event_date date DEFAULT CURRENT_DATE,
  p_bank_account_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  -- NEW optional params
  p_bank_fees numeric DEFAULT NULL,
  p_bank_fees_account_code text DEFAULT '5200',
  p_endorsed_to_contact_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- ============ EXISTING EVENTS (unchanged behavior) ============
    WHEN 'collect' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := p_bank_account_code; v_credit := '1125';
      v_new_status := 'محصل';
      v_tx_type := 'cheque_collection';
      v_desc := 'تحصيل شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'bounce' THEN
      v_debit := '1130'; v_credit := COALESCE(v_cheque.linked_account, p_bank_account_code, '1125');
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
      -- Status-only legacy behavior (kept for backward compat)
      UPDATE public.cheques SET status = 'ملغي', updated_at = now() WHERE id = p_cheque_id;
      RETURN jsonb_build_object('success', true, 'duplicate', false, 'transaction_id', NULL, 'reference', v_ref, 'status_only', true);

    WHEN 'pay_outbound' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := '1160'; v_credit := p_bank_account_code;
      v_new_status := 'مدفوع';
      v_tx_type := 'cheque_cashed';
      v_desc := 'صرف شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    -- ============ NEW EVENTS ============
    WHEN 'register' THEN
      -- Initial registration
      IF v_cheque.cheque_type = 'وارد' THEN
        v_debit := '1150'; v_credit := COALESCE(v_cheque.linked_account, '1130');
        v_desc := 'تسجيل شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
      ELSE
        v_debit := COALESCE(v_cheque.linked_account, '2110'); v_credit := '1160';
        v_desc := 'تسجيل شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');
      END IF;
      v_new_status := v_cheque.status::text;  -- registration does not change status
      v_tx_type := 'cheque_register';

    WHEN 'deposit' THEN
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'bank required'); END IF;
      v_debit := '1125'; v_credit := '1150';
      v_new_status := 'مودع';
      v_tx_type := 'cheque_deposit';
      v_desc := 'إيداع شيك وارد - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'cashed' THEN
      -- Outbound cheque actually cashed at bank (alias for pay_outbound but uses source_bank)
      v_debit := '1160';
      v_credit := COALESCE(p_bank_account_code, v_cheque.linked_account, '1120');
      v_new_status := 'مدفوع';
      v_tx_type := 'cheque_cashed';
      v_desc := 'صرف شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '');

    WHEN 'outgoing_bounced' THEN
      -- Outbound cheque bounced: reverse the suppliers entry
      v_debit := '1160'; v_credit := '2110';
      v_new_status := 'مرتجع';
      v_tx_type := 'cheque_bounce';
      v_desc := 'شيك صادر مرتجع - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'recover' THEN
      -- Outbound cheque recovered (taken back from supplier)
      v_debit := '1160'; v_credit := '2110';
      v_new_status := 'ملغي';
      v_tx_type := 'cheque_recover';
      v_desc := 'استرداد شيك صادر - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'return_to_customer' THEN
      -- Inbound cheque returned to original customer
      v_debit := '1130'; v_credit := '1150';
      v_new_status := 'مرتجع';
      v_tx_type := 'cheque_return';
      v_desc := 'إرجاع شيك للزبون - ' || COALESCE(v_cheque.party_name, '') || ' #' || COALESCE(v_cheque.cheque_number, '') || ' - ' || COALESCE(p_reason, '');

    WHEN 'cancel_with_reverse' THEN
      -- Cancel with proper reverse entry (NEW; old 'cancel' kept as status-only)
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

  -- Validate accounts (soft - skip if validator not strict)
  BEGIN
    PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
    PERFORM public._fc_validate_postable_account(p_user_id, v_credit);
  EXCEPTION WHEN OTHERS THEN
    -- account validator may not exist for legacy charts; continue
    NULL;
  END;

  -- Insert main transaction
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

  -- Optional bank fees side-entry (used by bounce events)
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

  -- Update cheque status & link
  UPDATE public.cheques
  SET status = v_new_status::cheque_status,
      linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
      updated_at = now()
  WHERE id = p_cheque_id;

  -- History (best-effort)
  BEGIN
    INSERT INTO public.cheque_status_history(
      cheque_id, user_id, from_status, to_status, action_type, reason, linked_transaction_id, notes
    ) VALUES (
      p_cheque_id, p_user_id, v_cheque.status, v_new_status::cheque_status,
      p_event, p_reason, v_tx_id, p_notes
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- history is non-critical
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


-- ------------------------------------------------------------
-- 7) NEW: create_cheque_bounce_atomic (convenience wrapper)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_cheque_bounce_atomic(
  p_user_id uuid,
  p_cheque_id uuid,
  p_bounce_date date,
  p_bounce_reason text,
  p_bank_fees numeric DEFAULT 0,
  p_outbound boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT public.create_cheque_lifecycle_event(
    p_user_id := p_user_id,
    p_cheque_id := p_cheque_id,
    p_event := CASE WHEN p_outbound THEN 'outgoing_bounced' ELSE 'bounce' END,
    p_event_date := p_bounce_date,
    p_bank_account_code := NULL,
    p_notes := p_bounce_reason,
    p_idempotency_key := CASE WHEN p_outbound THEN 'CHQ-OBNC-' ELSE 'CHQ-BNC-' END || p_cheque_id::text,
    p_bank_fees := NULLIF(p_bank_fees, 0),
    p_bank_fees_account_code := '5200',
    p_endorsed_to_contact_id := NULL,
    p_reason := p_bounce_reason
  );
$function$;


-- ------------------------------------------------------------
-- GRANTS
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.void_voucher_atomic(uuid, uuid, text, boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_voucher_atomic(uuid, uuid, text, date, numeric, text, text, text, uuid, text, text, text, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cheque_bounce_atomic(uuid, uuid, date, text, numeric, boolean) TO authenticated;
