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
      'error', COALESCE(v_rpc->>'error', 'unknown_error')
    );
  END IF;

  v_tx_id := NULLIF(v_rpc->>'transaction_id','')::uuid;
  v_replayed := COALESCE((v_rpc->>'duplicate')::boolean, false);

  v_result := jsonb_build_object(
    'transaction_id', v_tx_id,
    'transaction_ids', CASE WHEN v_tx_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(v_tx_id) END,
    'allocations', COALESCE(v_rpc->'allocations', 'null'::jsonb)
  );

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