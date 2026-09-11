-- Tighten: internal engine helpers are not callable by signed-in users
REVOKE EXECUTE ON FUNCTION public.resolve_receipt_account_roles_v1(uuid,text,text,text,uuid,text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.build_receipt_posting_intent_v1(uuid,jsonb,jsonb,uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.shadow_compare_receipt_posting_v1(uuid,uuid,jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.posting_intents_v1_immutable() FROM authenticated;

-- Wire the posting engine into the receipt command behind posting.receipt_v1
CREATE OR REPLACE FUNCTION public.create_receipt_command_v1(p_envelope jsonb)
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
  v_use_engine boolean := false;
  v_intent jsonb;
  v_shadow jsonb;
  v_posting_intent_id uuid;
BEGIN
  IF COALESCE(p_envelope->>'command_type','') <> 'finance.create_receipt.v1' THEN
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
    v_command_id, 'finance.create_receipt.v1', 1,
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
       AND command_type = 'finance.create_receipt.v1'
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

  v_has_alloc := (jsonb_typeof(v_payload->'allocations') = 'array'
                  AND jsonb_array_length(v_payload->'allocations') > 0);

  -- Posting Engine V1 is used ONLY when explicitly enabled AND the receipt
  -- carries no invoice allocation (allocation stays on the legacy path).
  v_use_engine := (NOT v_has_alloc)
                  AND public.is_command_flag_enabled_v1(v_owner, 'posting.receipt_v1');

  IF v_use_engine THEN
    BEGIN
      v_intent := public.build_receipt_posting_intent_v1(
                    v_owner, v_ctx,
                    v_payload || jsonb_build_object('amount', v_amount),
                    v_command_id, v_correlation);
      v_rpc := public.post_receipt_v1(
                 v_intent,
                 v_payload || jsonb_build_object('idempotency_key', v_idem));
      v_posting_intent_id := NULLIF(v_rpc->>'posting_intent_id','')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_rpc := jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  ELSE
    v_rpc := public.create_receipt_with_entry(
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
      'error', COALESCE(v_rpc->>'error', 'unknown_error')
    );
  END IF;

  v_tx_id := NULLIF(v_rpc->>'transaction_id','')::uuid;
  v_replayed := COALESCE((v_rpc->>'duplicate')::boolean, false);

  -- SHADOW MODE: compute the V1 intent and compare it with the legacy result.
  -- Never writes accounting effects. Only runs on the legacy path.
  IF (NOT v_use_engine) AND (NOT v_has_alloc) AND (NOT v_replayed)
     AND public.is_command_flag_enabled_v1(v_owner, 'posting.receipt_v1_shadow') THEN
    BEGIN
      v_intent := public.build_receipt_posting_intent_v1(
                    v_owner, v_ctx,
                    v_payload || jsonb_build_object('amount', v_amount),
                    v_command_id, v_correlation);
      v_shadow := public.shadow_compare_receipt_posting_v1(v_owner, v_tx_id, v_intent);
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
        'finance.receipt.command', v_command_id, 'receipt.gl', 1,
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

  IF public.is_command_flag_enabled_v1(v_owner, 'events.receipt_v1') THEN
    v_event_id := public.emit_domain_event_v1(
      'finance.receipt.created.v1', 1,
      'finance.receipt', v_tx_id,
      v_owner, v_actor,
      NULLIF(v_ctx->>'company_id','')::uuid,
      NULLIF(v_ctx->>'branch_id','')::uuid,
      v_command_id, v_correlation, v_causation,
      'finance.create_receipt.v1:' || v_idem,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.create_receipt_command_v1(jsonb) FROM anon;