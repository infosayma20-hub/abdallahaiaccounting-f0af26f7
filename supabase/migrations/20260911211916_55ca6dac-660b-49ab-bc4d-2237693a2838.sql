-- =====================================================================
-- STAGE 3B — PAYMENT COMMAND V1 + PAYMENT POSTING V1 (NON-CHEQUE ONLY)
-- Reuses: CommandEnvelopeV1, CommandContextV1, Posting Engine V1 pattern,
--         posting_intents_v1, business_commands, domain_events_outbox.
-- Additive only. All flags default OFF. Cheques excluded by hard guard.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Cheque exclusion guard (hard, non-bypassable)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_cheque_payment_v1(p_payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(p_payload->>'payment_method','') ILIKE '%شيك%'
    OR COALESCE(p_payload->>'payment_method','') ILIKE '%cheque%'
    OR COALESCE(p_payload->>'payment_method','') ILIKE '%check%'
    OR (p_payload ? 'cheque_id')
    OR (p_payload ? 'cheque_ids')
    OR (p_payload ? 'cheques')
    OR (p_payload ? 'cheque_number')
    OR (p_payload ? 'cheque_book_id')
    OR COALESCE(p_payload->>'cash_account_code','') LIKE '2120%'
    OR COALESCE(p_payload->>'cash_account_code','') LIKE '1150%'
    OR COALESCE(p_payload->>'contact_account_code','') LIKE '2120%'
    OR COALESCE(p_payload->>'contact_account_code','') LIKE '1150%';
$$;

-- ---------------------------------------------------------------------
-- 1) Account role resolution — mirrors create_payment_with_entry exactly
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_payment_account_roles_v1(
  p_owner_id uuid,
  p_payment_method text,
  p_cash_account_code text,
  p_contact_account_code text,
  p_contact_id uuid,
  p_contact_name text,
  p_employee_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_debit text;
  v_credit text;
  v_debit_role text;
  v_credit_role text;
BEGIN
  -- DEBIT = what we settle / expense (legacy: contact_account_code, else 2140 employee, else 2110)
  IF p_contact_account_code IS NOT NULL THEN
    v_debit := p_contact_account_code;
    v_debit_role := 'EXPLICIT';
  ELSIF p_employee_id IS NOT NULL THEN
    v_debit := '2140'; v_debit_role := 'EMPLOYEE_PAYABLE';
  ELSE
    v_debit := '2110'; v_debit_role := 'ACCOUNTS_PAYABLE';
  END IF;

  -- CREDIT = funding source (legacy mapping). Cheque method never reaches here.
  IF p_cash_account_code IS NOT NULL THEN
    v_credit := p_cash_account_code;
    v_credit_role := 'EXPLICIT';
  ELSIF p_payment_method ILIKE '%نقد%' OR p_payment_method ILIKE '%cash%' THEN
    v_credit := '1110'; v_credit_role := 'CASH';
  ELSIF p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%bank%' THEN
    v_credit := '1120'; v_credit_role := 'BANK';
  ELSIF p_payment_method ILIKE '%شيك%' OR p_payment_method ILIKE '%cheque%' THEN
    RAISE EXCEPTION 'payment posting v1: cheque payments are out of scope' USING ERRCODE = '0A000';
  ELSE
    v_credit := '1110'; v_credit_role := 'CASH';
  END IF;

  -- Legacy subledger behaviour, reproduced byte-for-byte:
  IF p_contact_id IS NOT NULL AND p_employee_id IS NULL THEN
    IF v_debit LIKE '113%' THEN
      v_debit := public.resolve_postable_account(p_owner_id, v_debit, p_contact_id, p_contact_name);
      v_debit_role := COALESCE(NULLIF(v_debit_role,'EXPLICIT'),'ACCOUNTS_RECEIVABLE') || '_SUBLEDGER';
    ELSE
      v_debit := public.resolve_postable_account(p_owner_id, '2110', p_contact_id, p_contact_name);
      v_debit_role := 'ACCOUNTS_PAYABLE_SUBLEDGER';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'debit_role', v_debit_role,
    'debit_account_code', v_debit,
    'credit_role', v_credit_role,
    'credit_account_code', v_credit
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 2) PaymentPostingIntentV1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_payment_posting_intent_v1(
  p_owner_id uuid,
  p_context jsonb,
  p_payload jsonb,
  p_command_id uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount numeric;
  v_currency text := COALESCE(NULLIF(p_payload->>'currency',''), 'شيكل');
  v_method text := COALESCE(NULLIF(p_payload->>'payment_method',''), 'نقدي');
  v_date date := COALESCE(NULLIF(p_payload->>'voucher_date','')::date, CURRENT_DATE);
  v_rate numeric := NULLIF(p_payload->>'exchange_rate','')::numeric;
  v_is_foreign boolean;
  v_use_rate boolean;
  v_roles jsonb;
  v_locked text;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'posting intent: owner is required' USING ERRCODE = '22023';
  END IF;

  -- HARD CHEQUE EXCLUSION
  IF public.is_cheque_payment_v1(p_payload) THEN
    RAISE EXCEPTION 'posting intent: cheque payments are out of scope for payment posting v1'
      USING ERRCODE = '0A000';
  END IF;

  v_amount := NULLIF(p_payload->>'amount','')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'posting intent: amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'allocations') = 'array'
     AND jsonb_array_length(p_payload->'allocations') > 0 THEN
    RAISE EXCEPTION 'posting intent: allocation payments are not supported by posting engine v1'
      USING ERRCODE = '0A000';
  END IF;

  v_is_foreign := (v_currency IS NOT NULL AND v_currency <> 'شيكل' AND v_currency <> 'ILS');
  v_use_rate   := (COALESCE(v_rate,0) > 0 AND v_rate <> 1);

  SELECT period_name INTO v_locked
    FROM public.fiscal_periods
   WHERE user_id = p_owner_id
     AND v_date >= start_date AND v_date <= end_date
     AND status IN ('closed','locked')
   LIMIT 1;
  IF v_locked IS NOT NULL THEN
    RAISE EXCEPTION 'الفترة المحاسبية "%" مغلقة. لا يمكن الترحيل بتاريخ %', v_locked, v_date
      USING ERRCODE = '55006';
  END IF;

  v_roles := public.resolve_payment_account_roles_v1(
    p_owner_id, v_method,
    NULLIF(p_payload->>'cash_account_code',''),
    NULLIF(p_payload->>'contact_account_code',''),
    NULLIF(p_payload->>'contact_id','')::uuid,
    NULLIF(p_payload->>'contact_name',''),
    NULLIF(p_payload->>'employee_id','')::uuid
  );

  -- resolved accounts must never fall into the cheque families
  IF (v_roles->>'debit_account_code') LIKE '2120%' OR (v_roles->>'credit_account_code') LIKE '2120%'
     OR (v_roles->>'debit_account_code') LIKE '1150%' OR (v_roles->>'credit_account_code') LIKE '1150%' THEN
    RAISE EXCEPTION 'posting intent: cheque accounts are out of scope for payment posting v1'
      USING ERRCODE = '0A000';
  END IF;

  -- tenant ownership of both accounts
  IF NOT EXISTS (SELECT 1 FROM public.accounts a
                  WHERE a.user_id = p_owner_id
                    AND a.account_code = v_roles->>'debit_account_code') THEN
    RAISE EXCEPTION 'الحساب المدين % غير موجود ضمن شجرة حسابات المؤسسة', v_roles->>'debit_account_code'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a
                  WHERE a.user_id = p_owner_id
                    AND a.account_code = v_roles->>'credit_account_code') THEN
    RAISE EXCEPTION 'الحساب الدائن % غير موجود ضمن شجرة حسابات المؤسسة', v_roles->>'credit_account_code'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._fc_validate_postable_account(p_owner_id, v_roles->>'debit_account_code');
  PERFORM public._fc_validate_postable_account(p_owner_id, v_roles->>'credit_account_code');

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'posting_intent_version', 1,
    'posting_version', 1,
    'source_type', 'finance.payment.command',
    'effect_type', 'payment.gl',
    'command_id', p_command_id,
    'correlation_id', p_correlation_id,
    'owner_id', p_owner_id,
    'company_id', NULLIF(p_context->>'company_id','')::uuid,
    'branch_id', NULLIF(p_context->>'branch_id','')::uuid,
    'actor_id', NULLIF(p_context->>'actor_id','')::uuid,
    'effective_date', v_date,
    'currency', v_currency,
    'amount', v_amount,
    'base_amount', v_amount,
    'exchange_rate', CASE WHEN v_is_foreign AND v_use_rate THEN v_rate END,
    'foreign_amount', CASE WHEN v_is_foreign AND v_use_rate
                           THEN ROUND(v_amount / v_rate, 4) END,
    'debit_role', v_roles->>'debit_role',
    'credit_role', v_roles->>'credit_role',
    'debit_account_code', v_roles->>'debit_account_code',
    'credit_account_code', v_roles->>'credit_account_code',
    'contact_id', NULLIF(p_payload->>'contact_id','')::uuid,
    'payment_method', v_method,
    'balanced', true
  ));
END;
$$;

-- ---------------------------------------------------------------------
-- 3) Generic shadow comparator (intent vs an existing legacy transaction)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shadow_compare_posting_v1(
  p_owner_id uuid, p_transaction_id uuid, p_intent jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.transactions%ROWTYPE;
  v_diff jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO t FROM public.transactions
   WHERE id = p_transaction_id AND user_id = p_owner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('match', false, 'reason', 'legacy_transaction_not_found');
  END IF;

  IF t.debit_account_code IS DISTINCT FROM (p_intent->>'debit_account_code')
    THEN v_diff := v_diff || jsonb_build_array('debit_account_code'); END IF;
  IF t.credit_account_code IS DISTINCT FROM (p_intent->>'credit_account_code')
    THEN v_diff := v_diff || jsonb_build_array('credit_account_code'); END IF;
  IF t.amount IS DISTINCT FROM (p_intent->>'amount')::numeric
    THEN v_diff := v_diff || jsonb_build_array('amount'); END IF;
  IF t.currency IS DISTINCT FROM (p_intent->>'currency')
    THEN v_diff := v_diff || jsonb_build_array('currency'); END IF;
  IF COALESCE(t.exchange_rate, 0) IS DISTINCT FROM COALESCE((p_intent->>'exchange_rate')::numeric, 0)
    THEN v_diff := v_diff || jsonb_build_array('exchange_rate'); END IF;
  IF COALESCE(t.foreign_amount, 0) IS DISTINCT FROM COALESCE((p_intent->>'foreign_amount')::numeric, 0)
    THEN v_diff := v_diff || jsonb_build_array('foreign_amount'); END IF;
  IF t.transaction_date IS DISTINCT FROM (p_intent->>'effective_date')::date
    THEN v_diff := v_diff || jsonb_build_array('effective_date'); END IF;
  IF t.contact_id IS DISTINCT FROM NULLIF(p_intent->>'contact_id','')::uuid
    THEN v_diff := v_diff || jsonb_build_array('contact_id'); END IF;
  IF t.reference IS DISTINCT FROM COALESCE(NULLIF(p_intent->>'reference',''), t.reference)
    THEN v_diff := v_diff || jsonb_build_array('reference'); END IF;

  RETURN jsonb_build_object(
    'match', (jsonb_array_length(v_diff) = 0),
    'differences', v_diff,
    'legacy_transaction_id', p_transaction_id,
    'posting_version', 1
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4) Posting Engine — payment effect
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_payment_v1(p_intent jsonb, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner uuid := (p_intent->>'owner_id')::uuid;
  v_source_id uuid := (p_intent->>'command_id')::uuid;
  v_idem text := NULLIF(p_payload->>'idempotency_key','');
  v_existing uuid;
  v_intent_row public.posting_intents_v1%ROWTYPE;
  v_tx_id uuid;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF v_owner IS NULL OR v_source_id IS NULL THEN
    RAISE EXCEPTION 'posting engine: owner_id and command_id are required' USING ERRCODE = '22023';
  END IF;
  IF (p_intent->>'effect_type') <> 'payment.gl' THEN
    RAISE EXCEPTION 'posting engine: unsupported effect_type' USING ERRCODE = '22023';
  END IF;
  IF public.is_cheque_payment_v1(p_payload) THEN
    RAISE EXCEPTION 'posting engine: cheque payments are out of scope' USING ERRCODE = '0A000';
  END IF;
  PERFORM public.assert_owner_scope(v_owner);

  SELECT * INTO v_intent_row FROM public.posting_intents_v1
   WHERE owner_id = v_owner
     AND source_type = p_intent->>'source_type'
     AND source_id = v_source_id
     AND effect_type = p_intent->>'effect_type'
     AND posting_version = (p_intent->>'posting_version')::int
     AND status = 'active'
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'transaction_id', v_intent_row.transaction_id,
      'posting_intent_id', v_intent_row.id, 'posting_version', 1);
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions
     WHERE user_id = v_owner AND idempotency_key = v_idem LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'transaction_id', v_existing, 'posting_version', 1);
    END IF;
  END IF;

  IF COALESCE((p_intent->>'amount')::numeric, 0) <= 0
     OR COALESCE((p_intent->>'base_amount')::numeric, -1)
        IS DISTINCT FROM COALESCE((p_intent->>'amount')::numeric, 0) THEN
    RAISE EXCEPTION 'posting engine: unbalanced intent' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.transactions(
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, idempotency_key,
    contact_id, payment_method, notes,
    exchange_rate, foreign_amount, workshop_id, cost_center_id
  ) VALUES (
    v_owner,
    (p_intent->>'effective_date')::date,
    COALESCE(NULLIF(p_payload->>'description',''),
             'سند صرف - ' || COALESCE(NULLIF(p_payload->>'contact_name',''), '')),
    p_intent->>'debit_account_code',
    p_intent->>'credit_account_code',
    (p_intent->>'amount')::numeric,
    p_intent->>'currency',
    'payment',
    COALESCE(NULLIF(p_payload->>'reference',''), v_idem),
    v_idem,
    NULLIF(p_intent->>'contact_id','')::uuid,
    p_intent->>'payment_method',
    NULLIF(p_payload->>'notes',''),
    NULLIF(p_intent->>'exchange_rate','')::numeric,
    NULLIF(p_intent->>'foreign_amount','')::numeric,
    NULLIF(p_payload->>'workshop_id','')::uuid,
    NULLIF(p_payload->>'cost_center_id','')::uuid
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.posting_intents_v1(
    owner_id, company_id, branch_id, actor_id,
    source_type, source_id, effect_type, posting_version,
    command_id, correlation_id, effective_date, currency,
    amount, base_amount, exchange_rate,
    debit_role, credit_role, debit_account_code, credit_account_code,
    contact_id, status, transaction_id, effect_count,
    duration_ms, result_code
  ) VALUES (
    v_owner,
    NULLIF(p_intent->>'company_id','')::uuid,
    NULLIF(p_intent->>'branch_id','')::uuid,
    NULLIF(p_intent->>'actor_id','')::uuid,
    p_intent->>'source_type', v_source_id, p_intent->>'effect_type',
    (p_intent->>'posting_version')::int,
    (p_intent->>'command_id')::uuid,
    NULLIF(p_intent->>'correlation_id','')::uuid,
    (p_intent->>'effective_date')::date,
    p_intent->>'currency',
    (p_intent->>'amount')::numeric,
    (p_intent->>'base_amount')::numeric,
    NULLIF(p_intent->>'exchange_rate','')::numeric,
    p_intent->>'debit_role', p_intent->>'credit_role',
    p_intent->>'debit_account_code', p_intent->>'credit_account_code',
    NULLIF(p_intent->>'contact_id','')::uuid,
    'active', v_tx_id, 1,
    GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
    'posted'
  ) RETURNING id INTO v_intent_row.id;

  RETURN jsonb_build_object('success', true, 'duplicate', false,
    'transaction_id', v_tx_id, 'posting_intent_id', v_intent_row.id,
    'posting_version', 1, 'effect_count', 1);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Payment Command V1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_payment_command_v1(p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx jsonb;
  v_actor uuid;
  v_owner uuid;
  v_payload jsonb := COALESCE(p_envelope->'payload', '{}'::jsonb);
  v_command_id uuid := COALESCE(NULLIF(p_envelope->>'command_id','')::uuid, gen_random_uuid());
  v_correlation uuid := NULLIF(p_envelope->>'correlation_id','')::uuid;
  v_causation uuid := NULLIF(p_envelope->>'causation_id','')::uuid;
  v_source text := COALESCE(NULLIF(p_envelope->>'source',''), 'web');
  v_device text := NULLIF(p_envelope->>'device_id','');
  v_idem text := NULLIF(p_envelope->>'idempotency_key','');
  v_amount numeric;
  v_started timestamptz := clock_timestamp();
  v_row_id uuid;
  v_existing_cmd public.business_commands%ROWTYPE;
  v_rpc jsonb;
  v_tx_id uuid;
  v_result jsonb;
  v_replayed boolean := false;
  v_event_id uuid;
  v_has_alloc boolean;
  v_is_cheque boolean;
  v_use_engine boolean := false;
  v_intent jsonb;
  v_shadow jsonb;
  v_posting_intent_id uuid;
BEGIN
  IF COALESCE(p_envelope->>'command_type','') <> 'finance.create_payment.v1' THEN
    RAISE EXCEPTION 'unsupported command_type' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((p_envelope->>'schema_version')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'unsupported schema_version' USING ERRCODE = '22023';
  END IF;
  IF v_idem IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_amount := (v_payload->>'amount')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_amount := NULL;
  END;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  v_ctx   := public.resolve_command_context_v1(
               v_source,
               NULLIF(p_envelope->>'company_id','')::uuid,
               NULLIF(p_envelope->>'branch_id','')::uuid,
               v_device);
  v_actor := (v_ctx->>'actor_id')::uuid;
  v_owner := (v_ctx->>'owner_id')::uuid;

  INSERT INTO public.business_commands (
    command_id, command_type, schema_version,
    resolved_actor_id, resolved_owner_id,
    resolved_company_id, resolved_branch_id,
    source, device_id, idempotency_key,
    correlation_id, causation_id, status,
    payload_digest, started_at
  ) VALUES (
    v_command_id, 'finance.create_payment.v1', 1,
    v_actor, v_owner,
    NULLIF(v_ctx->>'company_id','')::uuid, NULLIF(v_ctx->>'branch_id','')::uuid,
    v_source, v_device, v_idem,
    v_correlation, v_causation, 'running',
    encode(extensions.digest(v_payload::text, 'sha256'), 'hex'), v_started
  )
  ON CONFLICT (resolved_owner_id, command_type, idempotency_key) DO NOTHING
  RETURNING id INTO v_row_id;

  IF v_row_id IS NULL THEN
    SELECT * INTO v_existing_cmd
      FROM public.business_commands
     WHERE resolved_owner_id = v_owner
       AND command_type = 'finance.create_payment.v1'
       AND idempotency_key = v_idem
     LIMIT 1;

    IF v_existing_cmd.status = 'succeeded' THEN
      RETURN jsonb_build_object(
        'version', 1,
        'status', 'succeeded',
        'command_id', v_existing_cmd.command_id,
        'replayed', true,
        'correlation_id', v_existing_cmd.correlation_id
      ) || COALESCE(v_existing_cmd.result_reference, '{}'::jsonb);
    END IF;

    v_row_id := v_existing_cmd.id;
    v_command_id := v_existing_cmd.command_id;
  END IF;

  v_has_alloc := COALESCE(jsonb_typeof(v_payload->'allocations') = 'array'
                  AND jsonb_array_length(v_payload->'allocations') > 0, false);
  v_is_cheque := public.is_cheque_payment_v1(v_payload);

  -- Engine used ONLY when: flag ON, no allocation, and NOT a cheque payment.
  v_use_engine := COALESCE((NOT v_has_alloc) AND (NOT v_is_cheque)
                  AND public.is_command_flag_enabled_v1(v_owner, 'posting.payment_v1'), false);

  IF v_use_engine THEN
    BEGIN
      v_intent := public.build_payment_posting_intent_v1(
                    v_owner, v_ctx,
                    v_payload || jsonb_build_object('amount', v_amount),
                    v_command_id, v_correlation);
      v_rpc := public.post_payment_v1(
                 v_intent,
                 v_payload || jsonb_build_object('idempotency_key', v_idem));
      v_posting_intent_id := NULLIF(v_rpc->>'posting_intent_id','')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_rpc := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  ELSE
    v_rpc := public.create_payment_with_entry(
      v_owner,
      NULLIF(v_payload->>'contact_id','')::uuid,
      NULLIF(v_payload->>'contact_name',''),
      v_amount,
      COALESCE(NULLIF(v_payload->>'payment_method',''), 'نقدي'),
      NULLIF(v_payload->>'description',''),
      COALESCE(NULLIF(v_payload->>'currency',''), 'شيكل'),
      v_idem,
      NULLIF(v_payload->>'voucher_date','')::date,
      NULLIF(v_payload->>'exchange_rate','')::numeric,
      NULLIF(v_payload->>'reference',''),
      NULLIF(v_payload->>'cash_account_code',''),
      NULLIF(v_payload->>'contact_account_code',''),
      NULLIF(v_payload->>'notes',''),
      NULLIF(v_payload->>'employee_id','')::uuid,
      NULLIF(v_payload->>'workshop_id','')::uuid,
      CASE WHEN jsonb_typeof(v_payload->'allocations') = 'array'
           THEN v_payload->'allocations' ELSE NULL END,
      NULLIF(v_payload->>'cost_center_id','')::uuid
    );
  END IF;

  IF COALESCE((v_rpc->>'success')::boolean, false) IS NOT TRUE THEN
    UPDATE public.business_commands
       SET status = 'failed',
           completed_at = clock_timestamp(),
           duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
           error_code = LEFT(COALESCE(v_rpc->>'error','unknown_error'), 300)
     WHERE id = v_row_id;

    RETURN jsonb_build_object(
      'version', 1,
      'status', 'failed',
      'command_id', v_command_id,
      'replayed', false,
      'correlation_id', v_correlation,
      'posting_version', CASE WHEN v_use_engine THEN 1 ELSE 0 END,
      'cheque_excluded', v_is_cheque,
      'error', COALESCE(v_rpc->>'error', 'unknown_error')
    );
  END IF;

  v_tx_id := NULLIF(v_rpc->>'transaction_id','')::uuid;
  v_replayed := COALESCE((v_rpc->>'duplicate')::boolean, false);

  -- SHADOW MODE: build the intent and compare with the legacy row. No writes.
  IF (NOT v_use_engine) AND (NOT v_has_alloc) AND (NOT v_is_cheque) AND (NOT v_replayed)
     AND public.is_command_flag_enabled_v1(v_owner, 'posting.payment_v1_shadow') THEN
    BEGIN
      v_intent := public.build_payment_posting_intent_v1(
                    v_owner, v_ctx,
                    v_payload || jsonb_build_object('amount', v_amount),
                    v_command_id, v_correlation);
      v_shadow := public.shadow_compare_posting_v1(v_owner, v_tx_id, v_intent);
      INSERT INTO public.posting_intents_v1(
        owner_id, company_id, branch_id, actor_id,
        source_type, source_id, effect_type, posting_version,
        command_id, correlation_id, effective_date, currency,
        amount, base_amount, exchange_rate,
        debit_role, credit_role, debit_account_code, credit_account_code,
        contact_id, status, transaction_id, effect_count, result_code, error_code
      ) VALUES (
        v_owner,
        NULLIF(v_intent->>'company_id','')::uuid,
        NULLIF(v_intent->>'branch_id','')::uuid,
        v_actor,
        'finance.payment.command', v_command_id, 'payment.gl', 1,
        v_command_id, v_correlation,
        (v_intent->>'effective_date')::date, v_intent->>'currency',
        (v_intent->>'amount')::numeric, (v_intent->>'base_amount')::numeric,
        NULLIF(v_intent->>'exchange_rate','')::numeric,
        v_intent->>'debit_role', v_intent->>'credit_role',
        v_intent->>'debit_account_code', v_intent->>'credit_account_code',
        NULLIF(v_intent->>'contact_id','')::uuid,
        'shadow', v_tx_id, 0,
        CASE WHEN (v_shadow->>'match')::boolean THEN 'shadow_match' ELSE 'shadow_mismatch' END,
        CASE WHEN (v_shadow->>'match')::boolean THEN NULL
             ELSE LEFT(v_shadow->>'differences', 300) END
      );
    EXCEPTION WHEN OTHERS THEN
      v_shadow := jsonb_build_object('match', false, 'reason', LEFT(SQLERRM, 300));
    END;
  END IF;

  v_result := jsonb_build_object(
    'transaction_id', v_tx_id,
    'transaction_ids', CASE WHEN v_tx_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_tx_id) END,
    'allocations', COALESCE(v_rpc->'allocations', 'null'::jsonb),
    'shadow', COALESCE(v_shadow, 'null'::jsonb),
    'cheque_excluded', v_is_cheque,
    'posting_version', CASE WHEN v_use_engine THEN 1 ELSE 0 END
  ) || CASE WHEN v_posting_intent_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('posting_intent_id', v_posting_intent_id) END;

  UPDATE public.business_commands
     SET status = 'succeeded',
         completed_at = clock_timestamp(),
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
         result_reference = v_result,
         error_code = NULL
   WHERE id = v_row_id;

  IF public.is_command_flag_enabled_v1(v_owner, 'events.payment_v1') THEN
    v_event_id := public.emit_domain_event_v1(
      'finance.payment.created.v1', 1,
      'finance.payment', v_tx_id,
      v_owner, v_actor,
      NULLIF(v_ctx->>'company_id','')::uuid,
      NULLIF(v_ctx->>'branch_id','')::uuid,
      v_command_id, v_correlation, v_causation,
      'finance.create_payment.v1:' || v_idem,
      NULLIF(v_payload->>'voucher_date','')::timestamptz,
      jsonb_strip_nulls(jsonb_build_object(
        'schema_version', 1,
        'transaction_id', v_tx_id,
        'posting_version', CASE WHEN v_use_engine THEN 1 ELSE 0 END,
        'currency',       COALESCE(NULLIF(v_payload->>'currency',''), 'شيكل'),
        'amount_bucket',  CASE
                            WHEN v_amount < 100    THEN 'lt_100'
                            WHEN v_amount < 1000   THEN 'lt_1k'
                            WHEN v_amount < 10000  THEN 'lt_10k'
                            WHEN v_amount < 100000 THEN 'lt_100k'
                            ELSE 'gte_100k' END,
        'has_contact',    (NULLIF(v_payload->>'contact_id','') IS NOT NULL),
        'has_allocations',(jsonb_typeof(v_payload->'allocations') = 'array'),
        'source',         v_source
      ))
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'status', 'succeeded',
    'command_id', v_command_id,
    'replayed', v_replayed,
    'correlation_id', v_correlation
  ) || v_result
    || CASE WHEN v_event_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('event_id', v_event_id) END;
END;
$$;

-- ---------------------------------------------------------------------
-- 6) EXPLICIT GRANTS — never rely on defaults
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_cheque_payment_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_payment_account_roles_v1(uuid,text,text,text,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_payment_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shadow_compare_posting_v1(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_payment_v1(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_payment_command_v1(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_cheque_payment_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_payment_account_roles_v1(uuid,text,text,text,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.build_payment_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.shadow_compare_posting_v1(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_payment_v1(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_payment_command_v1(jsonb) TO authenticated, service_role;