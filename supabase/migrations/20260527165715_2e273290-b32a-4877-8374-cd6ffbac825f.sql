
-- =========================================================
-- Phase 1 — Cost Centers foundation
-- =========================================================

-- 1.A — Complete cost_centers table
ALTER TABLE IF EXISTS public.cost_centers
  ADD COLUMN IF NOT EXISTS notes text;

-- Missing SELECT policy
DROP POLICY IF EXISTS "Users view own cost centers" ON public.cost_centers;
CREATE POLICY "Users view own cost centers" ON public.cost_centers
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;

CREATE INDEX IF NOT EXISTS idx_cost_centers_active
  ON public.cost_centers(user_id, is_active)
  WHERE is_deleted = false;

-- updated_at trigger if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cost_centers_updated_at'
  ) THEN
    CREATE TRIGGER trg_cost_centers_updated_at
      BEFORE UPDATE ON public.cost_centers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END$$;

-- 1.B — Add cost_center_id to all real ledger / document tables
ALTER TABLE public.transactions   ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.vouchers       ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.voucher_lines  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.invoices       ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_items  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_cc  ON public.transactions(cost_center_id)  WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_cc      ON public.vouchers(cost_center_id)      WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_lines_cc ON public.voucher_lines(cost_center_id) WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_cc      ON public.invoices(cost_center_id)      WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_cc ON public.invoice_items(cost_center_id) WHERE cost_center_id IS NOT NULL;

-- 1.C — Protect cost_center from delete if it has any activity
CREATE OR REPLACE FUNCTION public.prevent_cost_center_delete_if_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transactions  WHERE cost_center_id = OLD.id LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.vouchers      WHERE cost_center_id = OLD.id LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.voucher_lines WHERE cost_center_id = OLD.id LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.invoices      WHERE cost_center_id = OLD.id LIMIT 1)
  OR EXISTS (SELECT 1 FROM public.invoice_items WHERE cost_center_id = OLD.id LIMIT 1)
  THEN
    RAISE EXCEPTION 'لا يمكن حذف مركز التكلفة لأنه مرتبط بحركات. قم بتعطيله بدل الحذف.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cost_center_delete ON public.cost_centers;
CREATE TRIGGER trg_prevent_cost_center_delete
  BEFORE DELETE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cost_center_delete_if_used();

-- =========================================================
-- 1.D — Update RPCs to accept and propagate cost_center_id
-- (drop old signatures, recreate with new optional trailing param)
-- =========================================================

DROP FUNCTION IF EXISTS public.create_receipt_with_entry(uuid, uuid, text, numeric, text, text, text, text, date, numeric, text, text, text, text, uuid, uuid, jsonb);

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

-- -----------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_payment_with_entry(uuid, uuid, text, numeric, text, text, text, text, date, numeric, text, text, text, text, uuid, uuid, jsonb);

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

-- -----------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_journal_entry_multi_party_atomic(uuid, date, text, jsonb, text, text, text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.create_journal_entry_multi_party_atomic(
  p_user_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_currency text DEFAULT 'شيكل'::text,
  p_reference text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_source text DEFAULT 'manual'::text,
  p_exchange_rate numeric DEFAULT NULL::numeric,
  p_notes text DEFAULT NULL::text,
  p_cost_center_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_line_cc uuid;
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
    -- per-line cost center overrides voucher-level
    v_line_cc := COALESCE(
      NULLIF(v_line->>'cost_center_id','')::uuid,
      p_cost_center_id
    );
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, payment_method, notes,
      exchange_rate, foreign_amount, workshop_id, cost_center_id
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
      NULLIF(v_line->>'workshop_id','')::uuid,
      v_line_cc
    ) RETURNING id INTO v_first_id;
  END LOOP;

  RETURN jsonb_build_object('success',true,'duplicate',false,
    'transaction_id',v_first_id,'reference',v_ref,'lines',v_i,
    'idempotency_key', v_idem);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- -----------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_voucher_atomic(uuid, uuid, text, date, numeric, text, text, text, uuid, text, text, text, numeric, text, text, text, jsonb, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.update_voucher_atomic(
  p_user_id uuid,
  p_transaction_id uuid,
  p_kind text,
  p_voucher_date date,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_description text,
  p_contact_id uuid DEFAULT NULL::uuid,
  p_contact_name text DEFAULT NULL::text,
  p_cash_account_code text DEFAULT NULL::text,
  p_contact_account_code text DEFAULT NULL::text,
  p_exchange_rate numeric DEFAULT NULL::numeric,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text,
  p_journal_lines jsonb DEFAULT NULL::jsonb,
  p_allocations jsonb DEFAULT NULL::jsonb,
  p_employee_id uuid DEFAULT NULL::uuid,
  p_workshop_id uuid DEFAULT NULL::uuid,
  p_cost_center_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      COALESCE(p_currency,'شيكل'), p_reference, v_idem, 'manual',
      p_exchange_rate, p_notes, p_cost_center_id
    );
  ELSE
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
        p_employee_id, p_workshop_id, p_allocations, p_cost_center_id
      );
    ELSE
      v_new := public.create_payment_with_entry(
        p_user_id, p_contact_id, p_contact_name, p_amount,
        p_payment_method, p_description, p_currency, v_idem,
        p_voucher_date, p_exchange_rate, p_reference,
        p_cash_account_code, p_contact_account_code, p_notes,
        p_employee_id, p_workshop_id, p_allocations, p_cost_center_id
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
$function$;
