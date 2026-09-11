-- =====================================================================
-- STAGE 3C — MANUAL JOURNAL COMMAND + POSTING V1  (ADDITIVE, FLAGS OFF)
-- Reuses: CommandEnvelopeV1, resolve_command_context_v1, business_commands,
--         posting_intents_v1, domain_events_outbox, is_command_flag_enabled_v1.
-- Excluded (stay legacy): cheques, invoice allocations, system-generated
--         journals (invoices/POS/payroll/inventory/assets/receipts/payments).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Multi-line posting intent lines
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posting_intent_lines_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES public.posting_intents_v1(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  line_no integer NOT NULL,
  debit_account_code text NOT NULL,
  credit_account_code text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  contact_id uuid,
  cost_center_id uuid,
  description text,
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intent_id, line_no)
);

GRANT SELECT ON public.posting_intent_lines_v1 TO authenticated;
GRANT ALL ON public.posting_intent_lines_v1 TO service_role;

ALTER TABLE public.posting_intent_lines_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant read posting intent lines v1" ON public.posting_intent_lines_v1;
CREATE POLICY "tenant read posting intent lines v1"
  ON public.posting_intent_lines_v1
  FOR SELECT TO authenticated
  USING (owner_id = public.get_team_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_posting_intent_lines_v1_intent
  ON public.posting_intent_lines_v1(intent_id);
CREATE INDEX IF NOT EXISTS idx_posting_intent_lines_v1_owner
  ON public.posting_intent_lines_v1(owner_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 2) Server-side debit/credit pairing (mirror of the certified client rule)
--    Accepts free-form entries [{account_code, debit, credit, ...}] and
--    returns balanced debit<->credit pairs. Returns NULL when unbalanced.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pair_journal_lines_v1(p_entries jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  d jsonb[] := '{}';
  c jsonb[] := '{}';
  e jsonb;
  v_pairs jsonb := '[]'::jsonb;
  di int := 1; ci int := 1;
  dr numeric; cr numeric; amt numeric;
  td numeric := 0; tc numeric := 0;
  eps numeric := 0.005;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN RETURN NULL; END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    IF COALESCE(NULLIF(e->>'account_code',''), '') = '' THEN RETURN NULL; END IF;
    IF COALESCE((e->>'debit')::numeric,0) > 0 AND COALESCE((e->>'credit')::numeric,0) > 0 THEN
      RETURN NULL;
    END IF;
    IF COALESCE((e->>'debit')::numeric,0) > 0 THEN
      d := d || jsonb_set(e, '{remaining}', to_jsonb((e->>'debit')::numeric));
      td := td + (e->>'debit')::numeric;
    ELSIF COALESCE((e->>'credit')::numeric,0) > 0 THEN
      c := c || jsonb_set(e, '{remaining}', to_jsonb((e->>'credit')::numeric));
      tc := tc + (e->>'credit')::numeric;
    END IF;
  END LOOP;

  IF array_length(d,1) IS NULL OR array_length(c,1) IS NULL THEN RETURN NULL; END IF;
  IF abs(td - tc) > eps THEN RETURN NULL; END IF;

  WHILE di <= array_length(d,1) AND ci <= array_length(c,1) LOOP
    dr := (d[di]->>'remaining')::numeric;
    cr := (c[ci]->>'remaining')::numeric;
    amt := LEAST(dr, cr);
    IF amt > eps THEN
      IF (d[di]->>'account_code') = (c[ci]->>'account_code') THEN
        RETURN NULL; -- same-account pairs are rejected by the ledger writer
      END IF;
      v_pairs := v_pairs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'debit_account_code',  d[di]->>'account_code',
        'credit_account_code', c[ci]->>'account_code',
        'amount', ROUND(amt, 2),
        'contact_id', COALESCE(NULLIF(d[di]->>'contact_id',''), NULLIF(c[ci]->>'contact_id','')),
        'cost_center_id', COALESCE(NULLIF(d[di]->>'cost_center_id',''), NULLIF(c[ci]->>'cost_center_id','')),
        'description', COALESCE(NULLIF(d[di]->>'line_comment',''), NULLIF(c[ci]->>'line_comment',''))
      )));
    END IF;
    d[di] := jsonb_set(d[di], '{remaining}', to_jsonb(dr - amt));
    c[ci] := jsonb_set(c[ci], '{remaining}', to_jsonb(cr - amt));
    IF (d[di]->>'remaining')::numeric <= eps THEN di := di + 1; END IF;
    IF (c[ci]->>'remaining')::numeric <= eps THEN ci := ci + 1; END IF;
  END LOOP;

  IF jsonb_array_length(v_pairs) = 0 THEN RETURN NULL; END IF;
  RETURN v_pairs;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) Manual journal posting intent (multi-line, validated, no writes)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_manual_journal_posting_intent_v1(
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
AS $function$
DECLARE
  v_currency text := COALESCE(NULLIF(p_payload->>'currency',''), 'شيكل');
  v_date date := COALESCE(NULLIF(p_payload->>'entry_date','')::date, CURRENT_DATE);
  v_rate numeric := NULLIF(p_payload->>'exchange_rate','')::numeric;
  v_is_foreign boolean;
  v_use_rate boolean;
  v_pairs jsonb;
  v_line jsonb;
  v_total numeric := 0;
  v_locked text;
  v_code text;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'posting intent: owner is required' USING ERRCODE = '22023';
  END IF;

  -- Cheque + allocation payloads never enter the manual journal engine.
  IF jsonb_typeof(p_payload->'allocations') = 'array'
     AND jsonb_array_length(p_payload->'allocations') > 0 THEN
    RAISE EXCEPTION 'posting intent: allocations are not supported by manual journal v1'
      USING ERRCODE = '0A000';
  END IF;
  IF NULLIF(p_payload->>'cheque_id','') IS NOT NULL
     OR jsonb_typeof(p_payload->'cheques') = 'array' THEN
    RAISE EXCEPTION 'posting intent: cheque journals are out of scope for manual journal v1'
      USING ERRCODE = '0A000';
  END IF;

  -- Pairs may be supplied directly, otherwise derive them from raw entries.
  IF jsonb_typeof(p_payload->'lines') = 'array'
     AND jsonb_array_length(p_payload->'lines') > 0 THEN
    v_pairs := p_payload->'lines';
  ELSE
    v_pairs := public.pair_journal_lines_v1(p_payload->'entries');
  END IF;

  IF v_pairs IS NULL OR jsonb_array_length(v_pairs) = 0 THEN
    RAISE EXCEPTION 'posting intent: القيد غير متوازن أو السطور غير صالحة' USING ERRCODE = '22023';
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

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_pairs) LOOP
    IF COALESCE((v_line->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'posting intent: amount must be greater than zero' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(v_line->>'debit_account_code','') IS NULL
       OR NULLIF(v_line->>'credit_account_code','') IS NULL
       OR (v_line->>'debit_account_code') = (v_line->>'credit_account_code') THEN
      RAISE EXCEPTION 'posting intent: invalid accounts in line' USING ERRCODE = '22023';
    END IF;
    FOREACH v_code IN ARRAY ARRAY[v_line->>'debit_account_code', v_line->>'credit_account_code'] LOOP
      IF NOT EXISTS (SELECT 1 FROM public.accounts a
                      WHERE a.user_id = p_owner_id AND a.account_code = v_code) THEN
        RAISE EXCEPTION 'الحساب % غير موجود ضمن شجرة حسابات المؤسسة', v_code USING ERRCODE = '42501';
      END IF;
      PERFORM public._fc_validate_postable_account(p_owner_id, v_code);
    END LOOP;
    v_total := v_total + (v_line->>'amount')::numeric;
  END LOOP;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'posting_intent_version', 1,
    'posting_version', 1,
    'source_type', 'finance.manual_journal.command',
    'effect_type', 'manual_journal.gl',
    'command_id', p_command_id,
    'correlation_id', p_correlation_id,
    'owner_id', p_owner_id,
    'company_id', NULLIF(p_context->>'company_id','')::uuid,
    'branch_id', NULLIF(p_context->>'branch_id','')::uuid,
    'actor_id', NULLIF(p_context->>'actor_id','')::uuid,
    'effective_date', v_date,
    'currency', v_currency,
    'amount', v_total,
    'base_amount', v_total,
    'exchange_rate', CASE WHEN v_is_foreign AND v_use_rate THEN v_rate END,
    'line_count', jsonb_array_length(v_pairs),
    'lines', v_pairs,
    'balanced', true
  ));
END;
$function$;

-- ---------------------------------------------------------------------
-- 4) Posting engine — manual journal effects (multi-line, one transaction)
--    GL semantics are byte-for-byte the legacy semantics of
--    create_journal_entry_multi_party_atomic.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_manual_journal_v1(p_intent jsonb, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid := (p_intent->>'owner_id')::uuid;
  v_source_id uuid := (p_intent->>'command_id')::uuid;
  v_idem text := NULLIF(p_payload->>'idempotency_key','');
  v_currency text := p_intent->>'currency';
  v_rate numeric := NULLIF(p_intent->>'exchange_rate','')::numeric;
  v_use_rate boolean := (COALESCE(NULLIF(p_intent->>'exchange_rate','')::numeric,0) > 0);
  v_ref text;
  v_intent_row public.posting_intents_v1%ROWTYPE;
  v_intent_id uuid;
  v_line jsonb;
  v_i int := 0;
  v_tx_id uuid;
  v_last_tx uuid;
  v_existing uuid;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF v_owner IS NULL OR v_source_id IS NULL THEN
    RAISE EXCEPTION 'posting engine: owner_id and command_id are required' USING ERRCODE = '22023';
  END IF;
  IF (p_intent->>'effect_type') <> 'manual_journal.gl' THEN
    RAISE EXCEPTION 'posting engine: unsupported effect_type' USING ERRCODE = '22023';
  END IF;
  IF v_idem IS NULL THEN
    RAISE EXCEPTION 'posting engine: idempotency_key is required' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_owner_scope(v_owner);

  -- replay guard #1 — an active intent already produced these effects
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

  -- replay guard #2 — legacy-compatible ledger idempotency keys
  SELECT id INTO v_existing FROM public.transactions
   WHERE user_id = v_owner AND idempotency_key = v_idem || '-L1' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true,
      'transaction_id', v_existing, 'posting_version', 1);
  END IF;

  IF COALESCE((p_intent->>'amount')::numeric, 0) <= 0
     OR COALESCE((p_intent->>'base_amount')::numeric, -1)
        IS DISTINCT FROM COALESCE((p_intent->>'amount')::numeric, 0) THEN
    RAISE EXCEPTION 'posting engine: unbalanced intent' USING ERRCODE = '22023';
  END IF;

  v_ref := COALESCE(NULLIF(p_payload->>'reference',''), 'JV-'||to_char(now(),'YYYYMMDD-HH24MISS'));

  INSERT INTO public.posting_intents_v1(
    owner_id, company_id, branch_id, actor_id,
    source_type, source_id, effect_type, posting_version,
    command_id, correlation_id, effective_date, currency,
    amount, base_amount, exchange_rate,
    status, effect_count, result_code
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
    v_currency,
    (p_intent->>'amount')::numeric,
    (p_intent->>'base_amount')::numeric,
    v_rate,
    'active', COALESCE((p_intent->>'line_count')::int, 0), 'posted'
  ) RETURNING id INTO v_intent_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_intent->'lines') LOOP
    v_i := v_i + 1;
    INSERT INTO public.transactions(
      user_id, transaction_date, description,
      debit_account_code, credit_account_code, amount, currency,
      transaction_type, reference, idempotency_key,
      contact_id, notes, exchange_rate, foreign_amount, cost_center_id
    ) VALUES (
      v_owner,
      (p_intent->>'effective_date')::date,
      COALESCE(NULLIF(v_line->>'description',''), NULLIF(p_payload->>'description',''), v_ref),
      v_line->>'debit_account_code',
      v_line->>'credit_account_code',
      (v_line->>'amount')::numeric,
      v_currency,
      'manual_journal',
      v_ref,
      v_idem || '-L' || v_i,
      NULLIF(v_line->>'contact_id','')::uuid,
      COALESCE(NULLIF(v_line->>'notes',''), NULLIF(p_payload->>'notes','')),
      CASE WHEN v_use_rate THEN v_rate END,
      CASE WHEN v_use_rate THEN ROUND((v_line->>'amount')::numeric / v_rate, 6) END,
      COALESCE(NULLIF(v_line->>'cost_center_id','')::uuid,
               NULLIF(p_payload->>'cost_center_id','')::uuid)
    ) RETURNING id INTO v_tx_id;

    v_last_tx := v_tx_id;

    INSERT INTO public.posting_intent_lines_v1(
      intent_id, owner_id, line_no, debit_account_code, credit_account_code,
      amount, contact_id, cost_center_id, description, transaction_id
    ) VALUES (
      v_intent_id, v_owner, v_i,
      v_line->>'debit_account_code', v_line->>'credit_account_code',
      (v_line->>'amount')::numeric,
      NULLIF(v_line->>'contact_id','')::uuid,
      COALESCE(NULLIF(v_line->>'cost_center_id','')::uuid,
               NULLIF(p_payload->>'cost_center_id','')::uuid),
      NULLIF(v_line->>'description',''), v_tx_id
    );
  END LOOP;

  IF v_i = 0 THEN
    RAISE EXCEPTION 'posting engine: no journal lines to post' USING ERRCODE = '22023';
  END IF;

  -- legacy parity: the writer reports the LAST inserted ledger row
  UPDATE public.posting_intents_v1
     SET transaction_id = v_last_tx,
         effect_count = v_i,
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int)
   WHERE id = v_intent_id;

  RETURN jsonb_build_object('success', true, 'duplicate', false,
    'transaction_id', v_last_tx, 'reference', v_ref, 'lines', v_i,
    'posting_intent_id', v_intent_id, 'posting_version', 1, 'effect_count', v_i,
    'idempotency_key', v_idem);
END;
$function$;

-- ---------------------------------------------------------------------
-- 5) Shadow comparison — legacy ledger rows vs intent lines (read only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shadow_compare_manual_journal_v1(
  p_owner_id uuid, p_idempotency_key text, p_intent jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_diff jsonb := '[]'::jsonb;
  v_legacy jsonb;
  v_intent_lines jsonb;
  v_legacy_count int;
BEGIN
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'k'), '[]'::jsonb), COUNT(*)
    INTO v_legacy, v_legacy_count
    FROM (
      SELECT jsonb_build_object(
               'k', t.debit_account_code||'|'||t.credit_account_code||'|'||t.amount::text,
               'd', t.debit_account_code, 'c', t.credit_account_code,
               'a', t.amount, 'cur', t.currency, 'dt', t.transaction_date,
               'r', COALESCE(t.exchange_rate, 0)) AS x
        FROM public.transactions t
       WHERE t.user_id = p_owner_id
         AND t.idempotency_key LIKE p_idempotency_key || '-L%'
    ) s;

  IF v_legacy_count = 0 THEN
    RETURN jsonb_build_object('match', false, 'reason', 'legacy_transactions_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'k'), '[]'::jsonb)
    INTO v_intent_lines
    FROM (
      SELECT jsonb_build_object(
               'k', (l->>'debit_account_code')||'|'||(l->>'credit_account_code')||'|'||((l->>'amount')::numeric)::text,
               'd', l->>'debit_account_code', 'c', l->>'credit_account_code',
               'a', (l->>'amount')::numeric,
               'cur', p_intent->>'currency',
               'dt', (p_intent->>'effective_date')::date,
               'r', COALESCE(NULLIF(p_intent->>'exchange_rate','')::numeric, 0)) AS y
        FROM jsonb_array_elements(p_intent->'lines') l
    ) s2;

  IF v_legacy_count IS DISTINCT FROM jsonb_array_length(p_intent->'lines') THEN
    v_diff := v_diff || jsonb_build_array('line_count');
  END IF;
  IF v_legacy IS DISTINCT FROM v_intent_lines THEN
    v_diff := v_diff || jsonb_build_array('lines');
  END IF;

  RETURN jsonb_build_object(
    'match', (jsonb_array_length(v_diff) = 0),
    'differences', v_diff,
    'legacy_line_count', v_legacy_count,
    'posting_version', 1
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- 6) Manual Journal Command V1
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manual_journal_command_v1(p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_started timestamptz := clock_timestamp();
  v_row_id uuid;
  v_existing_cmd public.business_commands%ROWTYPE;
  v_intent jsonb;
  v_rpc jsonb;
  v_shadow jsonb;
  v_result jsonb;
  v_tx_id uuid;
  v_replayed boolean := false;
  v_use_engine boolean := false;
  v_posting_intent_id uuid;
  v_event_id uuid;
  v_has_alloc boolean;
  v_amount numeric;
BEGIN
  IF COALESCE(p_envelope->>'command_type','') <> 'finance.create_manual_journal.v1' THEN
    RAISE EXCEPTION 'unsupported command_type' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((p_envelope->>'schema_version')::int, 0) <> 1 THEN
    RAISE EXCEPTION 'unsupported schema_version' USING ERRCODE = '22023';
  END IF;
  IF v_idem IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required' USING ERRCODE = '22023';
  END IF;

  -- Existing Unify authorization rule for creating journal entries.
  IF NOT public.accountant_perm('can_create_journal') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية إنشاء قيد محاسبي' USING ERRCODE = '42501';
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
    v_command_id, 'finance.create_manual_journal.v1', 1,
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
       AND command_type = 'finance.create_manual_journal.v1'
       AND idempotency_key = v_idem
     LIMIT 1;

    IF v_existing_cmd.status = 'succeeded' THEN
      RETURN jsonb_build_object(
        'version', 1, 'status', 'succeeded',
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

  v_use_engine := COALESCE((NOT v_has_alloc)
                  AND public.is_command_flag_enabled_v1(v_owner, 'posting.manual_journal_v1'), false);

  IF v_use_engine THEN
    BEGIN
      v_intent := public.build_manual_journal_posting_intent_v1(
                    v_owner, v_ctx, v_payload, v_command_id, v_correlation);
      v_rpc := public.post_manual_journal_v1(
                 v_intent, v_payload || jsonb_build_object('idempotency_key', v_idem));
      v_posting_intent_id := NULLIF(v_rpc->>'posting_intent_id','')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_rpc := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  ELSE
    -- Certified legacy writer, unchanged.
    v_rpc := public.create_journal_entry_multi_party_atomic(
      v_owner,
      COALESCE(NULLIF(v_payload->>'entry_date','')::date, CURRENT_DATE),
      COALESCE(NULLIF(v_payload->>'description',''), ''),
      CASE WHEN jsonb_typeof(v_payload->'lines') = 'array'
           THEN v_payload->'lines'
           ELSE COALESCE(public.pair_journal_lines_v1(v_payload->'entries'), '[]'::jsonb) END,
      COALESCE(NULLIF(v_payload->>'currency',''), 'شيكل'),
      NULLIF(v_payload->>'reference',''),
      v_idem,
      COALESCE(NULLIF(v_payload->>'source',''), 'manual'),
      NULLIF(v_payload->>'exchange_rate','')::numeric,
      NULLIF(v_payload->>'notes',''),
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
      'version', 1, 'status', 'failed',
      'command_id', v_command_id, 'replayed', false,
      'correlation_id', v_correlation,
      'posting_version', CASE WHEN v_use_engine THEN 1 ELSE 0 END,
      'error', COALESCE(v_rpc->>'error', 'unknown_error')
    );
  END IF;

  v_tx_id := NULLIF(v_rpc->>'transaction_id','')::uuid;
  v_replayed := COALESCE((v_rpc->>'duplicate')::boolean, false);
  v_amount := NULLIF(v_intent->>'amount','')::numeric;

  -- SHADOW MODE: build the intent and compare with the legacy rows. No writes.
  IF (NOT v_use_engine) AND (NOT v_has_alloc) AND (NOT v_replayed)
     AND public.is_command_flag_enabled_v1(v_owner, 'posting.manual_journal_v1_shadow') THEN
    BEGIN
      v_intent := public.build_manual_journal_posting_intent_v1(
                    v_owner, v_ctx, v_payload, v_command_id, v_correlation);
      v_shadow := public.shadow_compare_manual_journal_v1(v_owner, v_idem, v_intent);
      INSERT INTO public.posting_intents_v1(
        owner_id, company_id, branch_id, actor_id,
        source_type, source_id, effect_type, posting_version,
        command_id, correlation_id, effective_date, currency,
        amount, base_amount, exchange_rate,
        status, transaction_id, effect_count, result_code, error_code
      ) VALUES (
        v_owner,
        NULLIF(v_intent->>'company_id','')::uuid,
        NULLIF(v_intent->>'branch_id','')::uuid,
        v_actor,
        'finance.manual_journal.command', v_command_id, 'manual_journal.gl', 1,
        v_command_id, v_correlation,
        (v_intent->>'effective_date')::date, v_intent->>'currency',
        (v_intent->>'amount')::numeric, (v_intent->>'base_amount')::numeric,
        NULLIF(v_intent->>'exchange_rate','')::numeric,
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
    'reference', v_rpc->>'reference',
    'lines', COALESCE((v_rpc->>'lines')::int, 0),
    'shadow', COALESCE(v_shadow, 'null'::jsonb),
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

  IF public.is_command_flag_enabled_v1(v_owner, 'events.manual_journal_v1') THEN
    v_event_id := public.emit_domain_event_v1(
      'finance.manual_journal.posted.v1', 1,
      'finance.manual_journal', v_tx_id,
      v_owner, v_actor,
      NULLIF(v_ctx->>'company_id','')::uuid,
      NULLIF(v_ctx->>'branch_id','')::uuid,
      v_command_id, v_correlation, v_causation,
      'finance.create_manual_journal.v1:' || v_idem,
      NULLIF(v_payload->>'entry_date','')::timestamptz,
      jsonb_strip_nulls(jsonb_build_object(
        'schema_version', 1,
        'transaction_id', v_tx_id,
        'posting_version', CASE WHEN v_use_engine THEN 1 ELSE 0 END,
        'currency', COALESCE(NULLIF(v_payload->>'currency',''), 'شيكل'),
        'line_count', COALESCE((v_rpc->>'lines')::int, 0),
        'amount_bucket', CASE
                            WHEN COALESCE(v_amount,0) < 100    THEN 'lt_100'
                            WHEN COALESCE(v_amount,0) < 1000   THEN 'lt_1k'
                            WHEN COALESCE(v_amount,0) < 10000  THEN 'lt_10k'
                            WHEN COALESCE(v_amount,0) < 100000 THEN 'lt_100k'
                            ELSE 'gte_100k' END,
        'source', v_source
      ))
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 1, 'status', 'succeeded',
    'command_id', v_command_id,
    'replayed', v_replayed,
    'correlation_id', v_correlation
  ) || v_result
    || CASE WHEN v_event_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('event_id', v_event_id) END;
END;
$function$;

-- ---------------------------------------------------------------------
-- 7) Privileges — engine internals are service-role only
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pair_journal_lines_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.build_manual_journal_posting_intent_v1(uuid, jsonb, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_manual_journal_v1(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shadow_compare_manual_journal_v1(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_manual_journal_command_v1(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pair_journal_lines_v1(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.build_manual_journal_posting_intent_v1(uuid, jsonb, jsonb, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_manual_journal_v1(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.shadow_compare_manual_journal_v1(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_journal_command_v1(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_manual_journal_command_v1(jsonb) IS
  'Stage 3C Manual Journal Command V1. Additive. Legacy writer by default; Posting Engine V1 only behind posting.manual_journal_v1. Cheques, allocations and system-generated journals are out of scope.';