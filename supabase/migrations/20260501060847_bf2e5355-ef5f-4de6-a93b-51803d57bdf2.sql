-- =====================================================================
-- FINANCIAL CORE STABILIZATION — Phase 1+2+3 Infrastructure
-- Safe, additive only. No mutation of historical data.
-- =====================================================================

-- ---------- 1. FEATURE FLAGS ------------------------------------------------
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.company_settings.feature_flags IS
  'Per-tenant rollout flags for the financial-core stabilization (e.g. use_atomic_cash_transfer, use_atomic_voucher_rpc, use_get_contact_balance).';

-- ---------- 2. DRIFT DETECTION VIEWS (READ-ONLY) ---------------------------
CREATE OR REPLACE VIEW public.v_drift_tx_no_idempotency AS
SELECT id, user_id, transaction_date, transaction_type, amount, reference, created_at
FROM public.transactions
WHERE idempotency_key IS NULL AND is_deleted = false;

CREATE OR REPLACE VIEW public.v_drift_tx_no_reference AS
SELECT id, user_id, transaction_date, transaction_type, amount, created_at
FROM public.transactions
WHERE (reference IS NULL OR reference = '') AND is_deleted = false;

CREATE OR REPLACE VIEW public.v_drift_tx_zero_amount AS
SELECT id, user_id, transaction_date, transaction_type, reference, created_at
FROM public.transactions
WHERE amount = 0 AND is_deleted = false;

CREATE OR REPLACE VIEW public.v_drift_tx_same_account AS
SELECT id, user_id, transaction_date, transaction_type, amount, debit_account_code, credit_account_code, created_at
FROM public.transactions
WHERE debit_account_code = credit_account_code
  AND debit_account_code IS NOT NULL
  AND is_deleted = false;

CREATE OR REPLACE VIEW public.v_drift_invoice_no_link AS
SELECT id, user_id, invoice_number, invoice_date, status, total_amount, created_at
FROM public.invoices
WHERE COALESCE(status,'') NOT IN ('draft','مسودة','cancelled','ملغي','مسودة','draft')
  AND linked_transaction_id IS NULL;

CREATE OR REPLACE VIEW public.v_drift_cheque_no_voucher AS
SELECT id, user_id, cheque_number, cheque_type, amount, status, cheque_date, created_at
FROM public.cheques
WHERE voucher_id IS NULL
  AND COALESCE(status::text,'') NOT IN ('ملغي');

CREATE OR REPLACE VIEW public.v_drift_tax_ledger_dup AS
SELECT reference_type, reference_id, COUNT(*) AS dup_count
FROM public.tax_ledger
WHERE reference_id IS NOT NULL
GROUP BY reference_type, reference_id
HAVING COUNT(*) > 1;

CREATE OR REPLACE VIEW public.v_financial_drift_summary AS
SELECT 'tx_no_idempotency'::text AS metric, COUNT(*)::bigint AS cnt FROM public.v_drift_tx_no_idempotency
UNION ALL SELECT 'tx_no_reference',     COUNT(*) FROM public.v_drift_tx_no_reference
UNION ALL SELECT 'tx_zero_amount',      COUNT(*) FROM public.v_drift_tx_zero_amount
UNION ALL SELECT 'tx_same_account',     COUNT(*) FROM public.v_drift_tx_same_account
UNION ALL SELECT 'invoice_no_link',     COUNT(*) FROM public.v_drift_invoice_no_link
UNION ALL SELECT 'cheque_no_voucher',   COUNT(*) FROM public.v_drift_cheque_no_voucher
UNION ALL SELECT 'tax_ledger_dup',      COUNT(*) FROM public.v_drift_tax_ledger_dup;

-- ---------- 3. SHARED VALIDATION HELPER -------------------------------------
CREATE OR REPLACE FUNCTION public._fc_validate_postable_account(p_user_id uuid, p_account_code text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_is_parent boolean;
BEGIN
  IF p_account_code IS NULL OR p_account_code = '' THEN
    RAISE EXCEPTION 'Account code is required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.accounts c
    WHERE c.user_id = p_user_id AND c.parent_code = p_account_code
  ) INTO v_is_parent;

  IF v_is_parent THEN
    RAISE EXCEPTION 'الحساب % حساب أب — يجب الترحيل لحساب فرعي', p_account_code;
  END IF;
END;
$$;

-- ---------- 4. CASH TRANSFER ATOMIC -----------------------------------------
CREATE OR REPLACE FUNCTION public.create_cash_transfer_atomic(
  p_user_id uuid,
  p_from_account_code text,
  p_to_account_code text,
  p_amount numeric,
  p_currency text DEFAULT 'شيكل',
  p_transfer_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_tx_id uuid;
  v_ref text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','amount must be > 0'); END IF;
  IF p_from_account_code = p_to_account_code THEN RETURN jsonb_build_object('success',false,'error','from = to account'); END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'TRF-'||gen_random_uuid()::text; END IF;

  -- idempotency check
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
    amount, currency, transaction_type, reference, idempotency_key, payment_method
  ) VALUES (
    p_user_id, p_transfer_date,
    COALESCE(p_description, 'تحويل من '||p_from_account_code||' إلى '||p_to_account_code),
    p_to_account_code, p_from_account_code,
    p_amount, p_currency, 'cash_transfer', v_ref, p_idempotency_key, 'transfer'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_id,'reference',v_ref);
END;
$$;

-- ---------- 5. BANK DEPOSIT ATOMIC ------------------------------------------
CREATE OR REPLACE FUNCTION public.create_bank_deposit_atomic(
  p_user_id uuid,
  p_cash_account_code text,
  p_bank_account_code text,
  p_amount numeric,
  p_currency text DEFAULT 'شيكل',
  p_deposit_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tx_id uuid; v_existing uuid; v_ref text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','amount must be > 0'); END IF;
  IF p_cash_account_code = p_bank_account_code THEN RETURN jsonb_build_object('success',false,'error','cash = bank'); END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'DEP-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, p_cash_account_code);
  PERFORM public._fc_validate_postable_account(p_user_id, p_bank_account_code);

  v_ref := 'DEP-'||to_char(now(),'YYYYMMDD-HH24MISS');

  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, idempotency_key, payment_method
  ) VALUES (
    p_user_id, p_deposit_date,
    COALESCE(p_description, 'إيداع نقدي في البنك'),
    p_bank_account_code, p_cash_account_code,
    p_amount, p_currency, 'bank_deposit', v_ref, p_idempotency_key, 'bank'
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_id,'reference',v_ref);
END;
$$;

-- ---------- 6. CURRENCY EXCHANGE ATOMIC -------------------------------------
CREATE OR REPLACE FUNCTION public.create_currency_exchange_atomic(
  p_user_id uuid,
  p_from_account_code text,
  p_to_account_code text,
  p_from_amount numeric,
  p_to_amount numeric,
  p_from_currency text,
  p_to_currency text,
  p_exchange_rate numeric,
  p_gain_loss_account_code text DEFAULT NULL,
  p_exchange_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_tx_out uuid;
  v_tx_in uuid;
  v_ref text;
  v_diff numeric;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_from_amount <= 0 OR p_to_amount <= 0 THEN RETURN jsonb_build_object('success',false,'error','amounts must be > 0'); END IF;
  IF p_from_account_code = p_to_account_code THEN RETURN jsonb_build_object('success',false,'error','from = to'); END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'FX-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  PERFORM public._fc_validate_postable_account(p_user_id, p_from_account_code);
  PERFORM public._fc_validate_postable_account(p_user_id, p_to_account_code);

  v_ref := 'FX-'||to_char(now(),'YYYYMMDD-HH24MISS');

  -- Out leg (deduct from source)
  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, foreign_amount, exchange_rate, currency, transaction_type, reference, idempotency_key, payment_method
  ) VALUES (
    p_user_id, p_exchange_date,
    COALESCE(p_description,'صرف عملة - خصم'),
    p_to_account_code, p_from_account_code,
    LEAST(p_from_amount, p_to_amount),
    p_from_amount, p_exchange_rate, p_from_currency,
    'currency_exchange', v_ref, p_idempotency_key||'-OUT', 'exchange'
  ) RETURNING id INTO v_tx_out;

  -- Optional gain/loss adjustment if amounts differ in base currency
  v_diff := p_to_amount - p_from_amount;
  IF p_gain_loss_account_code IS NOT NULL AND v_diff <> 0 THEN
    INSERT INTO public.transactions(
      user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key, payment_method
    ) VALUES (
      p_user_id, p_exchange_date,
      'فرق صرف عملة',
      CASE WHEN v_diff > 0 THEN p_to_account_code ELSE p_gain_loss_account_code END,
      CASE WHEN v_diff > 0 THEN p_gain_loss_account_code ELSE p_to_account_code END,
      ABS(v_diff), p_to_currency, 'exchange_diff', v_ref, p_idempotency_key||'-DIFF', 'exchange'
    );
  END IF;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_out,'reference',v_ref);
END;
$$;

-- ---------- 7. MANUAL JOURNAL ATOMIC ----------------------------------------
-- Multi-line balanced journal. p_lines is JSONB array of:
--   [{debit_account_code, credit_account_code, amount, description?}]
CREATE OR REPLACE FUNCTION public.create_journal_entry_atomic(
  p_user_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_currency text DEFAULT 'شيكل',
  p_reference text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_first_id uuid;
  v_ref text;
  v_line jsonb;
  v_i int := 0;
  v_total_d numeric := 0;
  v_total_c numeric := 0;
  v_da text; v_ca text; v_amt numeric;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success',false,'error','no lines');
  END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'JV-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  -- balance check
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_amt := COALESCE((v_line->>'amount')::numeric,0);
    IF v_amt <= 0 THEN RETURN jsonb_build_object('success',false,'error','amount > 0 required'); END IF;
    v_da := v_line->>'debit_account_code';
    v_ca := v_line->>'credit_account_code';
    IF v_da IS NULL OR v_ca IS NULL OR v_da = v_ca THEN
      RETURN jsonb_build_object('success',false,'error','invalid accounts in line');
    END IF;
    PERFORM public._fc_validate_postable_account(p_user_id, v_da);
    PERFORM public._fc_validate_postable_account(p_user_id, v_ca);
    v_total_d := v_total_d + v_amt;
    v_total_c := v_total_c + v_amt;
  END LOOP;

  v_ref := COALESCE(p_reference, 'JV-'||to_char(now(),'YYYYMMDD-HH24MISS'));

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_i := v_i + 1;
    v_amt := (v_line->>'amount')::numeric;
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key
    ) VALUES (
      p_user_id, p_entry_date,
      COALESCE(v_line->>'description', p_description),
      v_line->>'debit_account_code', v_line->>'credit_account_code',
      v_amt, p_currency,
      'manual_journal', v_ref, p_idempotency_key||'-L'||v_i
    ) RETURNING id INTO v_first_id;
  END LOOP;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_first_id,'reference',v_ref,'lines',v_i);
END;
$$;

-- ---------- 8. CHEQUE LIFECYCLE EVENT ---------------------------------------
-- Events: 'collect' | 'bounce' | 'endorse' | 'cancel' | 'pay_outbound'
CREATE OR REPLACE FUNCTION public.create_cheque_lifecycle_event(
  p_user_id uuid,
  p_cheque_id uuid,
  p_event text,
  p_event_date date DEFAULT CURRENT_DATE,
  p_bank_account_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cheque RECORD;
  v_existing uuid;
  v_tx_id uuid;
  v_ref text;
  v_debit text; v_credit text;
  v_new_status text;
BEGIN
  IF p_user_id IS NULL OR p_cheque_id IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','required params missing');
  END IF;

  SELECT * INTO v_cheque FROM public.cheques WHERE id=p_cheque_id AND user_id=p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','cheque not found'); END IF;

  IF p_idempotency_key IS NULL THEN
    p_idempotency_key := 'CHQ-'||p_event||'-'||p_cheque_id::text||'-'||to_char(now(),'YYYYMMDDHH24MISS');
  END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  v_ref := 'CHQ-'||v_cheque.cheque_number||'-'||p_event;

  -- Map event to debit/credit & new status
  CASE p_event
    WHEN 'collect' THEN
      -- Inbound cheque collected: Bank Dr / Cheques under collection (1125 or 1150) Cr
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success',false,'error','bank required'); END IF;
      v_debit := p_bank_account_code; v_credit := COALESCE(v_cheque.linked_account, '1150');
      v_new_status := 'محصل';
    WHEN 'bounce' THEN
      -- Reverse the collection if any: Receivables Dr / Bank-or-collection Cr
      v_debit := '1130'; v_credit := COALESCE(v_cheque.linked_account, p_bank_account_code, '1120');
      v_new_status := 'مرتجع';
    WHEN 'endorse' THEN
      -- Endorse to supplier: Suppliers (2110) Dr / Cheques under collection Cr
      v_debit := '2110'; v_credit := COALESCE(v_cheque.linked_account, '1150');
      v_new_status := 'مظهر';
    WHEN 'cancel' THEN
      -- Cancel: just status; no GL impact unless there was a prior posting (handled elsewhere)
      UPDATE public.cheques SET status='ملغي', updated_at=now() WHERE id=p_cheque_id;
      RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',NULL,'reference',v_ref,'status_only',true);
    WHEN 'pay_outbound' THEN
      -- Outbound cheque paid: Cheques payable (2130/1160) Cr / Bank Dr is created at issuance.
      -- Here mark as paid and reverse the temporary holding.
      IF p_bank_account_code IS NULL THEN RETURN jsonb_build_object('success',false,'error','bank required'); END IF;
      v_debit := '1160'; v_credit := p_bank_account_code;
      v_new_status := 'مدفوع';
    ELSE
      RETURN jsonb_build_object('success',false,'error','unknown event');
  END CASE;

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key, contact_id, payment_method, notes
  ) VALUES (
    p_user_id, p_event_date,
    'شيك '||v_cheque.cheque_number||' - '||p_event,
    v_debit, v_credit, v_cheque.amount, COALESCE(v_cheque.currency,'شيكل'),
    'cheque_'||p_event, v_ref, p_idempotency_key,
    v_cheque.contact_id, 'cheque', p_notes
  ) RETURNING id INTO v_tx_id;

  -- Update cheque status + history
  UPDATE public.cheques
  SET status = v_new_status::cheque_status,
      linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
      updated_at = now()
  WHERE id = p_cheque_id;

  INSERT INTO public.cheque_status_history(cheque_id, user_id, from_status, to_status, notes)
  VALUES (p_cheque_id, p_user_id, v_cheque.status, v_new_status::cheque_status, p_notes)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_id,'reference',v_ref,'new_status',v_new_status);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;
$$;

-- ---------- 9. CREDIT NOTE ATOMIC -------------------------------------------
CREATE OR REPLACE FUNCTION public.create_credit_note_atomic(
  p_user_id uuid,
  p_contact_id uuid,
  p_contact_name text,
  p_original_invoice_id uuid,
  p_amount numeric,
  p_note_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_currency text DEFAULT 'شيكل',
  p_idempotency_key text DEFAULT NULL,
  p_kind text DEFAULT 'sales' -- 'sales' or 'purchase'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tx_id uuid; v_existing uuid; v_ref text; v_debit text; v_credit text;
BEGIN
  IF p_user_id IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success',false,'error','invalid params');
  END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'CN-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  v_ref := 'CN-'||to_char(now(),'YYYYMMDD-HH24MISS');

  IF p_kind = 'sales' THEN
    -- Sales credit note: Sales Returns (4110) Dr / Receivables (1130) Cr
    v_debit := '4110'; v_credit := '1130';
  ELSE
    -- Purchase credit note: Suppliers (2110) Dr / Purchase Returns (5110) Cr
    v_debit := '2110'; v_credit := '5110';
  END IF;

  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, idempotency_key, contact_id
  ) VALUES (
    p_user_id, p_note_date,
    COALESCE(p_description,'إشعار '||CASE WHEN p_kind='sales' THEN 'دائن مبيعات' ELSE 'مدين مشتريات' END||' - '||COALESCE(p_contact_name,'')),
    v_debit, v_credit, p_amount, p_currency,
    CASE WHEN p_kind='sales' THEN 'credit_note_sales' ELSE 'credit_note_purchase' END,
    v_ref, p_idempotency_key, p_contact_id
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_id,'reference',v_ref);
END;
$$;

-- ---------- 10. SALE/PURCHASE RETURN ENTRY ----------------------------------
CREATE OR REPLACE FUNCTION public.create_return_with_entry(
  p_user_id uuid,
  p_contact_id uuid,
  p_amount numeric,
  p_kind text, -- 'sale' or 'purchase'
  p_return_date date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_currency text DEFAULT 'شيكل',
  p_idempotency_key text DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tx_id uuid; v_existing uuid; v_ref text; v_debit text; v_credit text;
BEGIN
  IF p_user_id IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success',false,'error','invalid params');
  END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'RET-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  v_ref := COALESCE(p_reference, 'RET-'||to_char(now(),'YYYYMMDD-HH24MISS'));

  IF p_kind='sale' THEN
    v_debit := '4110'; v_credit := '1130'; -- sales return / AR
  ELSE
    v_debit := '2110'; v_credit := '5110'; -- AP / purchase return
  END IF;

  INSERT INTO public.transactions(
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, reference, idempotency_key, contact_id
  ) VALUES (
    p_user_id, p_return_date,
    COALESCE(p_description,'مردود '||CASE WHEN p_kind='sale' THEN 'مبيعات' ELSE 'مشتريات' END),
    v_debit, v_credit, p_amount, p_currency,
    CASE WHEN p_kind='sale' THEN 'sale_return' ELSE 'purchase_return' END,
    v_ref, p_idempotency_key, p_contact_id
  ) RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_tx_id,'reference',v_ref);
END;
$$;

-- ---------- 11. GET CONTACT BALANCE (READ — single source of truth) ---------
CREATE OR REPLACE FUNCTION public.get_contact_balance(
  p_contact_id uuid,
  p_as_of_date date DEFAULT CURRENT_DATE,
  p_currency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance numeric := 0;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_user_id uuid;
  v_contact RECORD;
BEGIN
  IF p_contact_id IS NULL THEN RETURN jsonb_build_object('balance',0,'currency',p_currency); END IF;

  SELECT * INTO v_contact FROM public.contacts WHERE id=p_contact_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('balance',0,'error','contact not found'); END IF;
  v_user_id := v_contact.user_id;

  -- Sum debits/credits where the contact is the customer or supplier.
  -- AR (1130) and AP (2110) sub-accounts inclusive.
  SELECT
    COALESCE(SUM(CASE
      WHEN debit_account_code LIKE '113%' OR debit_account_code LIKE '211%' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN credit_account_code LIKE '113%' OR credit_account_code LIKE '211%' THEN amount ELSE 0 END), 0)
  INTO v_total_debit, v_total_credit
  FROM public.transactions
  WHERE user_id = v_user_id
    AND contact_id = p_contact_id
    AND transaction_date <= p_as_of_date
    AND is_deleted = false
    AND (p_currency IS NULL OR currency = p_currency);

  v_balance := v_total_debit - v_total_credit;

  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'balance', v_balance,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'currency', COALESCE(p_currency, 'شيكل'),
    'as_of_date', p_as_of_date
  );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.create_cash_transfer_atomic(uuid,text,text,numeric,text,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_bank_deposit_atomic(uuid,text,text,numeric,text,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_currency_exchange_atomic(uuid,text,text,numeric,numeric,text,text,numeric,text,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_journal_entry_atomic(uuid,date,text,jsonb,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cheque_lifecycle_event(uuid,uuid,text,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_credit_note_atomic(uuid,uuid,text,uuid,numeric,date,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_return_with_entry(uuid,uuid,numeric,text,date,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_balance(uuid,date,text) TO authenticated;
GRANT SELECT ON public.v_drift_tx_no_idempotency, public.v_drift_tx_no_reference, public.v_drift_tx_zero_amount, public.v_drift_tx_same_account, public.v_drift_invoice_no_link, public.v_drift_cheque_no_voucher, public.v_drift_tax_ledger_dup, public.v_financial_drift_summary TO authenticated;