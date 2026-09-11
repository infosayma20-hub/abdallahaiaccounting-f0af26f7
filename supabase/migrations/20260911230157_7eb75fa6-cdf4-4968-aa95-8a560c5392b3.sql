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
  v_posted jsonb := '[]'::jsonb;
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
    v_posted := v_posted || jsonb_build_array(jsonb_build_object('n', v_i, 'tx', v_tx_id, 'line', v_line));
  END LOOP;

  IF v_i = 0 THEN
    RAISE EXCEPTION 'posting engine: no journal lines to post' USING ERRCODE = '22023';
  END IF;

  -- The intent row is written ONCE, already final (accounting fields immutable).
  INSERT INTO public.posting_intents_v1(
    owner_id, company_id, branch_id, actor_id,
    source_type, source_id, effect_type, posting_version,
    command_id, correlation_id, effective_date, currency,
    amount, base_amount, exchange_rate,
    status, transaction_id, effect_count, duration_ms, result_code
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
    'active', v_last_tx, v_i,
    GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
    'posted'
  ) RETURNING id INTO v_intent_id;

  INSERT INTO public.posting_intent_lines_v1(
    intent_id, owner_id, line_no, debit_account_code, credit_account_code,
    amount, contact_id, cost_center_id, description, transaction_id)
  SELECT v_intent_id, v_owner, (p->>'n')::int,
         p->'line'->>'debit_account_code', p->'line'->>'credit_account_code',
         (p->'line'->>'amount')::numeric,
         NULLIF(p->'line'->>'contact_id','')::uuid,
         COALESCE(NULLIF(p->'line'->>'cost_center_id','')::uuid,
                  NULLIF(p_payload->>'cost_center_id','')::uuid),
         NULLIF(p->'line'->>'description',''),
         (p->>'tx')::uuid
    FROM jsonb_array_elements(v_posted) p;

  RETURN jsonb_build_object('success', true, 'duplicate', false,
    'transaction_id', v_last_tx, 'reference', v_ref, 'lines', v_i,
    'posting_intent_id', v_intent_id, 'posting_version', 1, 'effect_count', v_i,
    'idempotency_key', v_idem);
END;
$function$;

REVOKE ALL ON FUNCTION public.post_manual_journal_v1(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_manual_journal_v1(jsonb, jsonb) TO service_role;