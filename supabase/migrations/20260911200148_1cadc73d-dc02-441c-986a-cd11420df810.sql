-- =====================================================================
-- Receipt Command Envelope V1 — ADDITIVE ONLY
-- No existing object is modified. No data is backfilled.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.business_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL,
  command_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  resolved_actor_id uuid NOT NULL,
  resolved_owner_id uuid NOT NULL,
  resolved_company_id uuid,
  resolved_branch_id uuid,
  source text NOT NULL,
  device_id text,
  idempotency_key text NOT NULL,
  correlation_id uuid,
  causation_id uuid,
  status text NOT NULL DEFAULT 'running',
  payload_digest text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  result_reference jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_commands_status_chk
    CHECK (status IN ('running','succeeded','failed')),
  CONSTRAINT business_commands_source_chk
    CHECK (source IN ('web','mobile','pos','offline','api','automation','device'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_business_commands_idem
  ON public.business_commands (resolved_owner_id, command_type, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_business_commands_owner_created
  ON public.business_commands (resolved_owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_commands_command_id
  ON public.business_commands (command_id);

-- Read-only for authenticated tenant members; writes happen only inside
-- SECURITY DEFINER command functions (no INSERT/UPDATE/DELETE policies).
GRANT SELECT ON public.business_commands TO authenticated;
GRANT ALL ON public.business_commands TO service_role;

ALTER TABLE public.business_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can read their command audit" ON public.business_commands;
CREATE POLICY "Tenant members can read their command audit"
  ON public.business_commands
  FOR SELECT
  TO authenticated
  USING (
    resolved_actor_id = auth.uid()
    OR resolved_owner_id = public.get_team_owner_id(auth.uid())
  );

-- =====================================================================
-- Command context resolution (server-authoritative)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.resolve_command_context_v1(
  p_source text DEFAULT 'web',
  p_company_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_company uuid := NULL;
  v_branch uuid := NULL;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: command requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('web','mobile','pos','offline','api','automation','device') THEN
    RAISE EXCEPTION 'invalid command source' USING ERRCODE = '22023';
  END IF;

  v_owner := public.get_team_owner_id(v_actor);
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'tenant owner could not be resolved' USING ERRCODE = '42501';
  END IF;

  -- Existing Unify authorization rule, unchanged.
  PERFORM public.assert_owner_scope(v_owner);

  IF p_company_id IS NOT NULL THEN
    SELECT c.id INTO v_company
      FROM public.companies c
     WHERE c.id = p_company_id AND c.owner_id = v_owner;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'company does not belong to the resolved tenant' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT b.id INTO v_branch
      FROM public.branches b
     WHERE b.id = p_branch_id AND b.user_id = v_owner;
    IF v_branch IS NULL THEN
      RAISE EXCEPTION 'branch does not belong to the resolved tenant' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'actor_id', v_actor,
    'owner_id', v_owner,
    'company_id', v_company,
    'branch_id', v_branch,
    'source', p_source,
    'device_id', p_device_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_command_context_v1(text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_command_context_v1(text, uuid, uuid, text) TO authenticated;

-- =====================================================================
-- Shadow validation — performs NO writes and NO financial effects
-- =====================================================================
CREATE OR REPLACE FUNCTION public.validate_receipt_command_v1(p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx jsonb;
  v_owner uuid;
  v_payload jsonb := COALESCE(p_envelope->'payload', '{}'::jsonb);
  v_amount numeric;
  v_idem text := NULLIF(p_envelope->>'idempotency_key','');
  v_method text := COALESCE(v_payload->>'payment_method','نقدي');
  v_expected_debit text;
  v_expected_credit text;
  v_existing uuid;
  v_errors text[] := ARRAY[]::text[];
BEGIN
  IF COALESCE(p_envelope->>'command_type','') <> 'finance.create_receipt.v1' THEN
    v_errors := v_errors || 'unsupported command_type';
  END IF;
  IF COALESCE((p_envelope->>'schema_version')::int, 0) <> 1 THEN
    v_errors := v_errors || 'unsupported schema_version';
  END IF;
  IF v_idem IS NULL THEN
    v_errors := v_errors || 'idempotency_key is required';
  END IF;

  BEGIN
    v_amount := (v_payload->>'amount')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_amount := NULL;
  END;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    v_errors := v_errors || 'amount must be greater than zero';
  END IF;

  v_ctx := public.resolve_command_context_v1(
    COALESCE(p_envelope->>'source','web'),
    NULLIF(p_envelope->>'company_id','')::uuid,
    NULLIF(p_envelope->>'branch_id','')::uuid,
    NULLIF(p_envelope->>'device_id','')
  );
  v_owner := (v_ctx->>'owner_id')::uuid;

  -- Non-authoritative preview of the account mapping the existing RPC would use.
  v_expected_debit := COALESCE(
    NULLIF(v_payload->>'cash_account_code',''),
    CASE
      WHEN v_method ILIKE '%نقد%' OR v_method ILIKE '%cash%' THEN '1110'
      WHEN v_method ILIKE '%بنك%' OR v_method ILIKE '%bank%' THEN '1120'
      WHEN v_method ILIKE '%شيك%' OR v_method ILIKE '%cheque%' THEN '1150'
      ELSE '1110'
    END);
  v_expected_credit := COALESCE(
    NULLIF(v_payload->>'contact_account_code',''),
    CASE WHEN NULLIF(v_payload->>'employee_id','') IS NOT NULL THEN '1140' ELSE '1130' END);

  IF v_idem IS NOT NULL THEN
    SELECT t.id INTO v_existing
      FROM public.transactions t
     WHERE t.user_id = v_owner AND t.idempotency_key = v_idem
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'valid', (array_length(v_errors,1) IS NULL),
    'errors', to_jsonb(v_errors),
    'context', v_ctx,
    'would_replay', (v_existing IS NOT NULL),
    'existing_transaction_id', v_existing,
    'expected_debit_account_code', v_expected_debit,
    'expected_credit_account_code_base', v_expected_credit,
    'note', 'preview only: no financial effect was created'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_receipt_command_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_receipt_command_v1(jsonb) TO authenticated;

-- =====================================================================
-- Receipt Command V1 — thin, versioned boundary around the EXISTING
-- create_receipt_with_entry business logic. Single PostgreSQL transaction.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_receipt_command_v1(p_envelope jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
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
BEGIN
  -- 1. contract validation
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

  -- 2/3/4. server-authoritative context + existing authorization rules
  v_ctx   := public.resolve_command_context_v1(
               v_source,
               NULLIF(p_envelope->>'company_id','')::uuid,
               NULLIF(p_envelope->>'branch_id','')::uuid,
               v_device);
  v_actor := (v_ctx->>'actor_id')::uuid;
  v_owner := (v_ctx->>'owner_id')::uuid;

  -- 5. idempotency claim (composes with, does not replace, the RPC guard)
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
    encode(digest(v_payload::text, 'sha256'), 'hex'), v_started
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

    v_row_id := v_existing_cmd.id;   -- retry a previously failed command
    v_command_id := v_existing_cmd.command_id;
  END IF;

  -- 6..8. delegate to the EXISTING proven receipt logic (same transaction)
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
    -- The inner function rolls back its own effects before returning an error,
    -- so no partial financial record can survive here.
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

  -- 9. audit completion
  UPDATE public.business_commands
     SET status = 'succeeded',
         completed_at = clock_timestamp(),
         duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int),
         result_reference = v_result,
         error_code = NULL
   WHERE id = v_row_id;

  -- 10. stable versioned response
  RETURN jsonb_build_object(
    'version', 1,
    'status', 'succeeded',
    'command_id', v_command_id,
    'replayed', v_replayed,
    'correlation_id', v_correlation
  ) || v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_receipt_command_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_receipt_command_v1(jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_receipt_command_v1(jsonb) IS
  'Receipt Command Envelope V1 pilot. Thin versioned boundary around create_receipt_with_entry. Not an AI tool. Feature flag: commands.receipt_v1 (default off).';