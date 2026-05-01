-- =====================================================================
-- Phase 5A: Voucher allocation, multi-party journals, journal updates
-- Backward compatible. No data mutation. No frontend impact.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend payment_invoice_links to support new transaction-based pathway
-- ---------------------------------------------------------------------
ALTER TABLE public.payment_invoice_links
  ADD COLUMN IF NOT EXISTS transaction_id uuid NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy';

-- Make payment_id nullable so new pathway can use transaction_id only
ALTER TABLE public.payment_invoice_links
  ALTER COLUMN payment_id DROP NOT NULL;

-- Ensure exactly one of (payment_id, transaction_id) is set
ALTER TABLE public.payment_invoice_links
  DROP CONSTRAINT IF EXISTS pil_one_source_chk;
ALTER TABLE public.payment_invoice_links
  ADD CONSTRAINT pil_one_source_chk CHECK (
    (payment_id IS NOT NULL AND transaction_id IS NULL)
    OR (payment_id IS NULL AND transaction_id IS NOT NULL)
  );

-- Prevent same (payment_id, invoice_id) duplicate
CREATE UNIQUE INDEX IF NOT EXISTS pil_payment_invoice_uniq
  ON public.payment_invoice_links(payment_id, invoice_id)
  WHERE payment_id IS NOT NULL;

-- Prevent same (transaction_id, invoice_id) duplicate
CREATE UNIQUE INDEX IF NOT EXISTS pil_transaction_invoice_uniq
  ON public.payment_invoice_links(transaction_id, invoice_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pil_invoice_idx ON public.payment_invoice_links(invoice_id);
CREATE INDEX IF NOT EXISTS pil_user_idx ON public.payment_invoice_links(user_id);

-- Enable RLS if not already
ALTER TABLE public.payment_invoice_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pil_user_select ON public.payment_invoice_links;
CREATE POLICY pil_user_select ON public.payment_invoice_links
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid())
  );

DROP POLICY IF EXISTS pil_user_modify ON public.payment_invoice_links;
CREATE POLICY pil_user_modify ON public.payment_invoice_links
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() OR user_id IS NULL
  );


-- ---------------------------------------------------------------------
-- 2. Helper: recalculate invoice payment status from links
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_invoice_payment_status(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv RECORD;
  v_paid numeric := 0;
  v_remaining numeric;
  v_status text;
BEGIN
  SELECT id, user_id, total_amount, paid_amount FROM public.invoices
   WHERE id = p_invoice_id FOR UPDATE INTO v_inv;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice not found');
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_paid
  FROM public.payment_invoice_links
  WHERE invoice_id = p_invoice_id;

  v_remaining := COALESCE(v_inv.total_amount, 0) - v_paid;
  IF v_remaining <= 0.001 THEN
    v_status := 'paid';
    v_remaining := 0;
  ELSIF v_paid > 0.001 THEN
    v_status := 'partial';
  ELSE
    v_status := 'unpaid';
  END IF;

  UPDATE public.invoices
     SET paid_amount    = v_paid,
         remaining_amount = v_remaining,
         payment_status = v_status,
         updated_at     = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id,
                            'paid', v_paid, 'remaining', v_remaining, 'status', v_status);
END;
$$;


-- ---------------------------------------------------------------------
-- 3. allocate_voucher_to_invoices_atomic
-- ---------------------------------------------------------------------
-- p_allocations: jsonb array of { invoice_id: uuid, amount: numeric }
-- One of (p_payment_id, p_transaction_id) must be supplied.
-- Returns { success, links: [...], invoices: [...], total_allocated }
DROP FUNCTION IF EXISTS public.allocate_voucher_to_invoices_atomic(uuid, uuid, uuid, numeric, jsonb, boolean);
CREATE OR REPLACE FUNCTION public.allocate_voucher_to_invoices_atomic(
  p_user_id        uuid,
  p_payment_id     uuid,           -- nullable (legacy receipt_vouchers.id)
  p_transaction_id uuid,           -- nullable (transactions.id, new pathway)
  p_voucher_amount numeric,        -- total amount of the voucher (cap)
  p_allocations    jsonb,          -- [{invoice_id, amount}]
  p_allow_overpay  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alloc       jsonb;
  v_inv_id      uuid;
  v_amount      numeric;
  v_inv         RECORD;
  v_remaining   numeric;
  v_total_alloc numeric := 0;
  v_links       jsonb := '[]'::jsonb;
  v_invs        jsonb := '[]'::jsonb;
  v_link_id     uuid;
  v_recalc      jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user required');
  END IF;
  IF (p_payment_id IS NULL AND p_transaction_id IS NULL)
     OR (p_payment_id IS NOT NULL AND p_transaction_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'exactly one of payment_id/transaction_id required');
  END IF;
  IF p_allocations IS NULL OR jsonb_array_length(p_allocations) = 0 THEN
    RETURN jsonb_build_object('success', true, 'links', '[]'::jsonb, 'total_allocated', 0,
                              'message', 'no allocations supplied');
  END IF;
  IF p_voucher_amount IS NULL OR p_voucher_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'voucher amount must be > 0');
  END IF;

  -- validate source ownership
  IF p_payment_id IS NOT NULL THEN
    PERFORM 1 FROM public.receipt_vouchers WHERE id = p_payment_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'receipt voucher not found or not owned');
    END IF;
  ELSE
    PERFORM 1 FROM public.transactions WHERE id = p_transaction_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'transaction not found or not owned');
    END IF;
  END IF;

  -- pre-validate sum ≤ voucher amount
  SELECT COALESCE(SUM((x->>'amount')::numeric), 0)
    INTO v_total_alloc
    FROM jsonb_array_elements(p_allocations) AS x;

  IF v_total_alloc - p_voucher_amount > 0.001 THEN
    RETURN jsonb_build_object('success', false,
      'error', format('total allocations (%s) exceed voucher amount (%s)', v_total_alloc, p_voucher_amount));
  END IF;

  v_total_alloc := 0;

  -- iterate allocations
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_inv_id := (v_alloc->>'invoice_id')::uuid;
    v_amount := (v_alloc->>'amount')::numeric;

    IF v_inv_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'invalid allocation entry: %', v_alloc;
    END IF;

    SELECT id, user_id, total_amount, COALESCE(paid_amount,0) AS paid_amount,
           COALESCE(remaining_amount, total_amount) AS remaining_amount, payment_status, status
      INTO v_inv
      FROM public.invoices
     WHERE id = v_inv_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice % not found', v_inv_id;
    END IF;
    IF v_inv.user_id <> p_user_id THEN
      RAISE EXCEPTION 'invoice % not owned by user', v_inv_id;
    END IF;
    IF COALESCE(v_inv.status, 'posted') IN ('cancelled', 'void', 'draft') THEN
      RAISE EXCEPTION 'invoice % is in status % and cannot be allocated', v_inv_id, v_inv.status;
    END IF;

    v_remaining := v_inv.remaining_amount;
    IF NOT p_allow_overpay AND v_amount - v_remaining > 0.001 THEN
      RAISE EXCEPTION 'allocation % exceeds remaining (%) on invoice %', v_amount, v_remaining, v_inv_id;
    END IF;

    -- insert link (unique partial idx will block duplicates)
    BEGIN
      INSERT INTO public.payment_invoice_links(
        payment_id, transaction_id, invoice_id, allocated_amount, user_id, source
      ) VALUES (
        p_payment_id, p_transaction_id, v_inv_id, v_amount, p_user_id,
        CASE WHEN p_transaction_id IS NOT NULL THEN 'rpc_voucher' ELSE 'rpc_receipt' END
      ) RETURNING id INTO v_link_id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'invoice % already allocated from this source', v_inv_id;
    END;

    v_total_alloc := v_total_alloc + v_amount;
    v_links := v_links || jsonb_build_object('link_id', v_link_id, 'invoice_id', v_inv_id, 'amount', v_amount);

    -- recalc invoice status
    v_recalc := public.recalc_invoice_payment_status(v_inv_id);
    v_invs := v_invs || v_recalc;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_allocated', v_total_alloc,
    'links', v_links,
    'invoices', v_invs
  );

EXCEPTION WHEN OTHERS THEN
  -- ROLLBACK happens automatically (entire fn is one tx)
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ---------------------------------------------------------------------
-- 4. create_journal_entry_multi_party_atomic
--    Like create_journal_entry_atomic but each line may have
--    contact_id, employee_id, workshop_id, payment_method
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_journal_entry_multi_party_atomic(
  p_user_id        uuid,
  p_entry_date     date,
  p_description    text,
  p_lines          jsonb,
  p_currency       text DEFAULT 'شيكل',
  p_reference      text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source         text DEFAULT 'manual',
  p_exchange_rate  numeric DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_idem text;
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success',false,'error','no lines');
  END IF;
  v_idem := COALESCE(p_idempotency_key, 'JV-MP-'||gen_random_uuid()::text);

  SELECT id INTO v_existing FROM public.transactions
   WHERE user_id=p_user_id AND idempotency_key=v_idem LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing);
  END IF;

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
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, notes,
      exchange_rate, foreign_amount, workshop_id
    ) VALUES (
      p_user_id, p_entry_date,
      COALESCE(v_line->>'description', p_description),
      v_line->>'debit_account_code', v_line->>'credit_account_code',
      v_amt, p_currency,
      'manual_journal', v_ref, v_idem||'-L'||v_i,
      NULLIF(v_line->>'contact_id','')::uuid,
      v_line->>'payment_method',
      COALESCE(v_line->>'notes', p_notes),
      CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
      CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN v_amt ELSE NULL END,
      NULLIF(v_line->>'workshop_id','')::uuid
    ) RETURNING id INTO v_first_id;
  END LOOP;

  RETURN jsonb_build_object('success',true,'duplicate',false,
    'transaction_id',v_first_id,'reference',v_ref,'lines',v_i,
    'idempotency_key', v_idem);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ---------------------------------------------------------------------
-- 5. Extend create_receipt_with_entry: add allocations + employee_id + workshop_id
--    Backward compatible: all new params optional, defaults preserve old behavior.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_receipt_with_entry(
  uuid, uuid, text, numeric, text, text, text, text,
  date, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_receipt_with_entry(
  p_user_id              uuid,
  p_contact_id           uuid,
  p_contact_name         text,
  p_amount               numeric,
  p_payment_method       text DEFAULT 'نقدي',
  p_description          text DEFAULT NULL,
  p_currency             text DEFAULT 'شيكل',
  p_idempotency_key      text DEFAULT NULL,
  p_voucher_date         date DEFAULT NULL,
  p_exchange_rate        numeric DEFAULT NULL,
  p_reference            text DEFAULT NULL,
  p_cash_account_code    text DEFAULT NULL,
  p_contact_account_code text DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_employee_id          uuid DEFAULT NULL,
  p_workshop_id          uuid DEFAULT NULL,
  p_allocations          jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit);

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount, workshop_id
  )
  VALUES (
    p_user_id, v_date,
    COALESCE(p_description, 'سند قبض - ' || COALESCE(p_contact_name, '')),
    v_debit, v_credit, p_amount, COALESCE(p_currency, 'شيكل'),
    'receipt', COALESCE(p_reference, v_idem), v_idem,
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_amount ELSE NULL END,
    p_workshop_id
  )
  RETURNING id INTO v_tx_id;

  -- Optional allocations
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
$$;


-- ---------------------------------------------------------------------
-- 6. Extend create_payment_with_entry: same additions
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_payment_with_entry(
  uuid, uuid, text, numeric, text, text, text, text,
  date, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_payment_with_entry(
  p_user_id              uuid,
  p_contact_id           uuid,
  p_contact_name         text,
  p_amount               numeric,
  p_payment_method       text DEFAULT 'نقدي',
  p_description          text DEFAULT NULL,
  p_currency             text DEFAULT 'شيكل',
  p_idempotency_key      text DEFAULT NULL,
  p_voucher_date         date DEFAULT NULL,
  p_exchange_rate        numeric DEFAULT NULL,
  p_reference            text DEFAULT NULL,
  p_cash_account_code    text DEFAULT NULL,
  p_contact_account_code text DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_employee_id          uuid DEFAULT NULL,
  p_workshop_id          uuid DEFAULT NULL,
  p_allocations          jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Debit AP/employee/account, Credit Cash/Bank
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

  PERFORM public._fc_validate_postable_account(p_user_id, v_debit);
  PERFORM public._fc_validate_postable_account(p_user_id, v_credit);

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount, workshop_id
  )
  VALUES (
    p_user_id, v_date,
    COALESCE(p_description, 'سند صرف - ' || COALESCE(p_contact_name, '')),
    v_debit, v_credit, p_amount, COALESCE(p_currency, 'شيكل'),
    'payment', COALESCE(p_reference, v_idem), v_idem,
    p_contact_id, p_payment_method, p_notes,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_exchange_rate ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate <> 1 THEN p_amount ELSE NULL END,
    p_workshop_id
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
$$;


-- ---------------------------------------------------------------------
-- 7. Extend update_voucher_atomic: support journal kind via delete & recreate
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_voucher_atomic(
  uuid, uuid, text, date, numeric, text, text, text,
  uuid, text, text, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.update_voucher_atomic(
  p_user_id              uuid,
  p_transaction_id       uuid,
  p_kind                 text,           -- 'receipt' | 'payment' | 'journal'
  p_voucher_date         date,
  p_amount               numeric,
  p_currency             text,
  p_payment_method       text,
  p_description          text,
  p_contact_id           uuid DEFAULT NULL,
  p_contact_name         text DEFAULT NULL,
  p_cash_account_code    text DEFAULT NULL,
  p_contact_account_code text DEFAULT NULL,
  p_exchange_rate        numeric DEFAULT NULL,
  p_reference            text DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_idempotency_key      text DEFAULT NULL,
  p_journal_lines        jsonb DEFAULT NULL,
  p_allocations          jsonb DEFAULT NULL,
  p_employee_id          uuid DEFAULT NULL,
  p_workshop_id          uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing RECORD;
  v_new jsonb;
  v_idem text;
  v_old_ref text;
  v_voided_ids uuid[];
BEGIN
  IF p_user_id IS NULL OR p_transaction_id IS NULL OR p_kind IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing params');
  END IF;
  IF p_kind NOT IN ('receipt','payment','journal') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid kind');
  END IF;

  SELECT * INTO v_existing FROM public.transactions
   WHERE id = p_transaction_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction not found');
  END IF;

  v_idem := COALESCE(p_idempotency_key,
    UPPER(p_kind) || '-EDIT-' || p_transaction_id::text || '-' || to_char(now(), 'YYYYMMDDHH24MISSMS'));
  v_old_ref := v_existing.reference;

  -- For journal: void ALL lines sharing this reference
  IF p_kind = 'journal' THEN
    IF p_journal_lines IS NULL OR jsonb_array_length(p_journal_lines) = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'journal lines required');
    END IF;

    UPDATE public.transactions
       SET is_deleted = true,
           idempotency_key = NULL,
           notes = COALESCE(notes,'') || E'\n[REPLACED-BY-EDIT '||now()::text||']',
           updated_at = now()
     WHERE user_id = p_user_id
       AND reference = v_old_ref
       AND transaction_type = 'manual_journal'
       AND COALESCE(is_deleted,false) = false
     RETURNING id INTO v_voided_ids;

    v_new := public.create_journal_entry_multi_party_atomic(
      p_user_id, p_voucher_date, p_description, p_journal_lines,
      COALESCE(p_currency,'شيكل'), p_reference, v_idem, 'manual', p_exchange_rate, p_notes
    );
  ELSE
    -- receipt or payment: void original then recreate
    DELETE FROM public.payment_invoice_links WHERE transaction_id = p_transaction_id;

    UPDATE public.transactions
       SET is_deleted = true,
           idempotency_key = NULL,
           notes = COALESCE(notes,'') || E'\n[REPLACED-BY-EDIT '||now()::text||']',
           updated_at = now()
     WHERE id = p_transaction_id;

    IF p_kind = 'receipt' THEN
      v_new := public.create_receipt_with_entry(
        p_user_id, p_contact_id, p_contact_name, p_amount,
        p_payment_method, p_description, p_currency, v_idem,
        p_voucher_date, p_exchange_rate, p_reference,
        p_cash_account_code, p_contact_account_code, p_notes,
        p_employee_id, p_workshop_id, p_allocations
      );
    ELSE
      v_new := public.create_payment_with_entry(
        p_user_id, p_contact_id, p_contact_name, p_amount,
        p_payment_method, p_description, p_currency, v_idem,
        p_voucher_date, p_exchange_rate, p_reference,
        p_cash_account_code, p_contact_account_code, p_notes,
        p_employee_id, p_workshop_id, p_allocations
      );
    END IF;
  END IF;

  IF NOT (v_new->>'success')::boolean THEN
    RAISE EXCEPTION 'recreate failed: %', COALESCE(v_new->>'error','unknown');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'voided_id', p_transaction_id,
    'kind', p_kind,
    'new', v_new
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
