-- =====================================================================
-- STAGE 3A — RECEIPT POSTING ENGINE V1 (additive, OFF by default)
-- =====================================================================

-- 1) Posting intent registry -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posting_intents_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  company_id uuid,
  branch_id uuid,
  actor_id uuid,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  effect_type text NOT NULL,
  posting_version integer NOT NULL DEFAULT 1,
  command_id uuid,
  correlation_id uuid,
  effective_date date NOT NULL,
  currency text NOT NULL,
  amount numeric NOT NULL,
  base_amount numeric,
  exchange_rate numeric,
  debit_role text,
  credit_role text,
  debit_account_code text,
  credit_account_code text,
  contact_id uuid,
  status text NOT NULL DEFAULT 'active',
  transaction_id uuid,
  reversal_transaction_id uuid,
  effect_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  result_code text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posting_intents_v1_status_chk
    CHECK (status IN ('shadow','active','reversed','failed')),
  CONSTRAINT posting_intents_v1_amount_chk CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS posting_intents_v1_active_uk
  ON public.posting_intents_v1 (owner_id, source_type, source_id, effect_type, posting_version)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS posting_intents_v1_owner_created_idx
  ON public.posting_intents_v1 (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posting_intents_v1_command_idx
  ON public.posting_intents_v1 (command_id) WHERE command_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posting_intents_v1_tx_idx
  ON public.posting_intents_v1 (transaction_id) WHERE transaction_id IS NOT NULL;

-- Privileges: read-only for tenant users; no direct writes at all.
REVOKE ALL ON public.posting_intents_v1 FROM PUBLIC;
REVOKE ALL ON public.posting_intents_v1 FROM anon;
GRANT SELECT ON public.posting_intents_v1 TO authenticated;
GRANT ALL ON public.posting_intents_v1 TO service_role;

ALTER TABLE public.posting_intents_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posting_intents_v1_tenant_read ON public.posting_intents_v1;
CREATE POLICY posting_intents_v1_tenant_read
  ON public.posting_intents_v1
  FOR SELECT TO authenticated
  USING (owner_id = public.get_team_owner_id(auth.uid()));

-- Immutability guard: rows may never be updated or deleted by any role
-- other than the internal SECURITY DEFINER engine (which only inserts).
CREATE OR REPLACE FUNCTION public.posting_intents_v1_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'posting_intents_v1 rows are immutable (delete rejected)'
      USING ERRCODE = '42501';
  END IF;
  -- only status/reversal linkage may move forward
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.effect_type IS DISTINCT FROM OLD.effect_type
     OR NEW.posting_version IS DISTINCT FROM OLD.posting_version
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.debit_account_code IS DISTINCT FROM OLD.debit_account_code
     OR NEW.credit_account_code IS DISTINCT FROM OLD.credit_account_code
     OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
    RAISE EXCEPTION 'posting_intents_v1 accounting fields are immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_posting_intents_v1_immutable ON public.posting_intents_v1;
CREATE TRIGGER trg_posting_intents_v1_immutable
  BEFORE UPDATE OR DELETE ON public.posting_intents_v1
  FOR EACH ROW EXECUTE FUNCTION public.posting_intents_v1_immutable();

-- 2) Account role resolver (mirrors current receipt behaviour exactly) -------
CREATE OR REPLACE FUNCTION public.resolve_receipt_account_roles_v1(
  p_owner_id uuid,
  p_payment_method text,
  p_cash_account_code text,
  p_contact_account_code text,
  p_contact_id uuid,
  p_contact_name text,
  p_employee_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_debit text;
  v_credit text;
  v_debit_role text;
  v_credit_role text;
BEGIN
  IF p_cash_account_code IS NOT NULL THEN
    v_debit := p_cash_account_code;
    v_debit_role := 'EXPLICIT';
  ELSIF p_payment_method ILIKE '%نقد%' OR p_payment_method ILIKE '%cash%' THEN
    v_debit := '1110'; v_debit_role := 'CASH';
  ELSIF p_payment_method ILIKE '%بنك%' OR p_payment_method ILIKE '%bank%' THEN
    v_debit := '1120'; v_debit_role := 'BANK';
  ELSIF p_payment_method ILIKE '%شيك%' OR p_payment_method ILIKE '%cheque%' THEN
    v_debit := '1150'; v_debit_role := 'CHEQUES_RECEIVABLE';
  ELSE
    v_debit := '1110'; v_debit_role := 'CASH';
  END IF;

  IF p_contact_account_code IS NOT NULL THEN
    v_credit := p_contact_account_code;
    v_credit_role := 'EXPLICIT';
  ELSIF p_employee_id IS NOT NULL THEN
    v_credit := '1140'; v_credit_role := 'EMPLOYEE_RECEIVABLE';
  ELSE
    v_credit := '1130'; v_credit_role := 'ACCOUNTS_RECEIVABLE';
  END IF;

  IF p_contact_id IS NOT NULL AND p_employee_id IS NULL THEN
    IF v_credit IS NULL OR v_credit LIKE '2115%' OR v_credit LIKE '1146%'
       OR v_credit NOT LIKE '113%' THEN
      v_credit := '1130';
      v_credit_role := 'ACCOUNTS_RECEIVABLE';
    END IF;
    v_credit := public.resolve_postable_account(p_owner_id, v_credit, p_contact_id, p_contact_name);
    v_credit_role := COALESCE(NULLIF(v_credit_role,'EXPLICIT'), 'ACCOUNTS_RECEIVABLE') || '_SUBLEDGER';
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'debit_role', v_debit_role,
    'debit_account_code', v_debit,
    'credit_role', v_credit_role,
    'credit_account_code', v_credit
  );
END;
$fn$;

-- 3) PostingIntentV1 builder (pure validation, NO writes) --------------------
CREATE OR REPLACE FUNCTION public.build_receipt_posting_intent_v1(
  p_owner_id uuid,
  p_context jsonb,
  p_payload jsonb,
  p_command_id uuid DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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

  v_amount := NULLIF(p_payload->>'amount','')::numeric;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'posting intent: amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_payload->'allocations') = 'array'
     AND jsonb_array_length(p_payload->'allocations') > 0 THEN
    RAISE EXCEPTION 'posting intent: allocation receipts are not supported by posting engine v1'
      USING ERRCODE = '0A000';
  END IF;

  v_is_foreign := (v_currency IS NOT NULL AND v_currency <> 'شيكل' AND v_currency <> 'ILS');
  v_use_rate   := (COALESCE(v_rate,0) > 0 AND v_rate <> 1);

  -- fiscal lock (the transactions trigger enforces this too; we fail early)
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

  v_roles := public.resolve_receipt_account_roles_v1(
    p_owner_id, v_method,
    NULLIF(p_payload->>'cash_account_code',''),
    NULLIF(p_payload->>'contact_account_code',''),
    NULLIF(p_payload->>'contact_id','')::uuid,
    NULLIF(p_payload->>'contact_name',''),
    NULLIF(p_payload->>'employee_id','')::uuid
  );

  -- tenant ownership + postable (leaf) validation for both legs
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
    'source_type', 'finance.receipt.command',
    'effect_type', 'receipt.gl',
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
$fn$;

-- 4) Shadow comparison (never writes accounting effects) ---------------------
CREATE OR REPLACE FUNCTION public.shadow_compare_receipt_posting_v1(
  p_owner_id uuid,
  p_transaction_id uuid,
  p_intent jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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

  RETURN jsonb_build_object(
    'match', (jsonb_array_length(v_diff) = 0),
    'differences', v_diff,
    'legacy_transaction_id', p_transaction_id,
    'posting_version', 1
  );
END;
$fn$;

-- 5) Posting Engine V1 — the only writer of V1 GL effects --------------------
CREATE OR REPLACE FUNCTION public.post_receipt_v1(
  p_intent jsonb,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
  PERFORM public.assert_owner_scope(v_owner);

  -- duplicate posting guard by source/effect/version
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

  -- legacy idempotency parity: the transactions-level key still wins
  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.transactions
     WHERE user_id = v_owner AND idempotency_key = v_idem LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'transaction_id', v_existing, 'posting_version', 1);
    END IF;
  END IF;

  -- debit = credit invariant (single balanced double-entry row)
  IF COALESCE((p_intent->>'amount')::numeric, 0) <= 0 THEN
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
             'سند قبض - ' || COALESCE(NULLIF(p_payload->>'contact_name',''), '')),
    p_intent->>'debit_account_code',
    p_intent->>'credit_account_code',
    (p_intent->>'amount')::numeric,
    p_intent->>'currency',
    'receipt',
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
$fn$;

-- Privileges: the engine is NOT callable by ordinary users, anon, or AI.
REVOKE ALL ON FUNCTION public.post_receipt_v1(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_receipt_v1(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.post_receipt_v1(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.post_receipt_v1(jsonb, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_receipt_account_roles_v1(uuid,text,text,text,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_receipt_account_roles_v1(uuid,text,text,text,uuid,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_receipt_account_roles_v1(uuid,text,text,text,uuid,text,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.shadow_compare_receipt_posting_v1(uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shadow_compare_receipt_posting_v1(uuid,uuid,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.shadow_compare_receipt_posting_v1(uuid,uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.posting_intents_v1_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.posting_intents_v1_immutable() FROM anon;