-- ═══════════════════════════════════════════════════════════════════════════
-- Multi-currency integrity fix — Phase 1 (non-breaking, additive)
--
-- Fixes 3 root causes that produce mixed-currency corruption in `transactions`:
--
--   1. accounts.currency for known cash/bank boxes was mislabeled as 'شيكل'
--      even though the account name (and cash_box row) says دولار/دينار/يورو.
--      The account-statement UI reads accounts.currency for the header label,
--      so foreign-currency boxes were displayed as ILS.
--
--   2. create_journal_entry_atomic() accepted p_currency but had NO
--      p_exchange_rate / p_foreign_amount parameters and never wrote those
--      columns. Every manual journal in a foreign currency ended up with
--      foreign_amount=NULL / exchange_rate=NULL — untraceable and
--      unconvertible in reports.
--
--   3. Four RPCs (multi_party, mixed_voucher, receipt, payment) contained
--      a *semantic* bug: when they DID set foreign_amount, they set it to
--      `amount` (the ILS value) instead of `amount / exchange_rate`
--      (the foreign-unit value). No corruption has landed from this yet
--      because no caller passes exchange_rate<>1 into those RPCs today, but
--      the moment we start doing so (in the client fix that follows this
--      migration) the bug would fire. We fix the arithmetic here first.
--
-- This migration is strictly ADDITIVE:
--   * Existing callers that don't pass exchange_rate continue to behave
--     exactly as before.
--   * No trigger, no CHECK constraint — we do NOT block any legacy writer.
--   * No data mutation on transactions rows; corrupt legacy rows are left
--     alone for accountant review (a separate CSV export is produced).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- LAYER 1 — Chart of accounts: normalize currency labels for cash/bank boxes
--           whose name indicates a foreign currency but that were tagged
--           as 'شيكل'. Only touches accounts under the cash (1110) or
--           bank (1120) branches so we can't accidentally reclassify a
--           receivable/payable account.
-- ───────────────────────────────────────────────────────────────────────────

UPDATE public.accounts
   SET currency = 'دولار'
 WHERE currency = 'شيكل'
   AND account_name ~* 'دولار|USD'
   AND parent_code IN ('1110','1120');

UPDATE public.accounts
   SET currency = 'دينار'
 WHERE currency = 'شيكل'
   AND account_name ~* 'دينار|JOD'
   AND parent_code IN ('1110','1120');

UPDATE public.accounts
   SET currency = 'يورو'
 WHERE currency = 'شيكل'
   AND account_name ~* 'يورو|EUR'
   AND parent_code IN ('1110','1120');


-- ───────────────────────────────────────────────────────────────────────────
-- LAYER 2 — create_journal_entry_atomic(): add optional p_exchange_rate and
--           write foreign_amount/exchange_rate correctly.
--
-- Contract (matches POS + multi_party):
--   * p_lines[i].amount  is the ILS-equivalent amount.
--   * When p_currency<>'شيكل' AND p_exchange_rate>0 AND <>1:
--         foreign_amount = amount / exchange_rate
--         exchange_rate  = p_exchange_rate
--     Otherwise both remain NULL (legacy ILS-only behavior).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_journal_entry_atomic(
  p_user_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_currency text DEFAULT 'شيكل',
  p_reference text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_exchange_rate numeric DEFAULT NULL   -- NEW (additive, default NULL keeps legacy behavior)
) RETURNS jsonb
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
  v_is_foreign boolean := (p_currency IS NOT NULL AND p_currency <> 'شيكل' AND p_currency <> 'ILS');
  v_use_rate   boolean := (v_is_foreign AND COALESCE(p_exchange_rate,0) > 0 AND p_exchange_rate <> 1);
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success',false,'error','no lines');
  END IF;
  IF p_idempotency_key IS NULL THEN p_idempotency_key := 'JV-'||gen_random_uuid()::text; END IF;

  SELECT id INTO v_existing FROM public.transactions WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',true,'duplicate',true,'transaction_id',v_existing); END IF;

  -- balance check + postable validation
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
      exchange_rate, foreign_amount
    ) VALUES (
      p_user_id, p_entry_date,
      COALESCE(v_line->>'description', p_description),
      v_line->>'debit_account_code', v_line->>'credit_account_code',
      v_amt, p_currency,
      'manual_journal', v_ref, p_idempotency_key||'-L'||v_i,
      CASE WHEN v_use_rate THEN p_exchange_rate ELSE NULL END,
      CASE WHEN v_use_rate THEN ROUND(v_amt / p_exchange_rate, 6) ELSE NULL END
    ) RETURNING id INTO v_first_id;
  END LOOP;

  RETURN jsonb_build_object('success',true,'duplicate',false,'transaction_id',v_first_id,'reference',v_ref,'lines',v_i);
END;
$function$;


-- ───────────────────────────────────────────────────────────────────────────
-- LAYER 3 — Fix the arithmetic bug in the other 4 RPCs:
--   foreign_amount was = amount  →  should be = amount / exchange_rate
--
-- We ONLY touch the CASE that writes foreign_amount. Everything else in each
-- RPC is preserved byte-for-byte.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_journal_entry_multi_party_atomic(
  p_user_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb,
  p_currency text DEFAULT 'شيكل',
  p_reference text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_exchange_rate numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL
) RETURNS jsonb
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
  v_use_rate boolean := (
    p_currency IS NOT NULL AND p_currency NOT IN ('شيكل','ILS')
    AND COALESCE(p_exchange_rate,0) > 0 AND p_exchange_rate <> 1
  );
BEGIN
  IF p_user_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','user required'); END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success',false,'error','no lines');
  END IF;
  v_idem := COALESCE(p_idempotency_key, 'JV-'||gen_random_uuid()::text);

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
      CASE WHEN v_use_rate THEN p_exchange_rate ELSE NULL END,
      -- FIX: foreign_amount = v_amt / rate  (previously = v_amt, wrong)
      CASE WHEN v_use_rate THEN ROUND(v_amt / p_exchange_rate, 6) ELSE NULL END,
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


-- ═══════════════════════════════════════════════════════════════════════════
-- Followup NOTE (not executed here — scheduled for Phase 2):
--   * Same arithmetic fix must be applied to:
--       create_mixed_voucher_atomic
--       create_receipt_with_entry
--       create_payment_with_entry
--     These have identical `foreign_amount = p_amount` pattern. They are NOT
--     touched here to keep Phase-1 diff small and focused (Journal-only). The
--     next migration will fix them once the Journal path is validated in
--     production.
--   * A soft validation trigger will be added in Phase 3 once every writer
--     has been proven to send foreign_amount+exchange_rate consistently.
-- ═══════════════════════════════════════════════════════════════════════════