-- =====================================================================
-- Stage 2 — TRANSACTIONAL OUTBOX + DOMAIN EVENTS V1
-- Additive only. No existing table, column, policy, index or business
-- function is altered or dropped. No data is backfilled.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.domain_events_outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid NOT NULL UNIQUE,
  event_type        text NOT NULL,
  event_version     int  NOT NULL DEFAULT 1,
  aggregate_type    text NOT NULL,
  aggregate_id      uuid,
  aggregate_sequence bigint,
  owner_id          uuid NOT NULL,
  actor_id          uuid,
  company_id        uuid,
  branch_id         uuid,
  command_id        uuid,
  correlation_id    uuid,
  causation_id      uuid,
  dedupe_key        text NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  effective_at      timestamptz,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'pending',
  attempt_count     int  NOT NULL DEFAULT 0,
  next_attempt_at   timestamptz,
  last_error        text,
  processed_at      timestamptz,
  dead_lettered_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domain_events_outbox_status_chk
    CHECK (status IN ('pending','processing','processed','failed','dead_letter','suppressed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_events_outbox_dedupe
  ON public.domain_events_outbox (owner_id, event_type, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_domain_events_outbox_pending
  ON public.domain_events_outbox (status, next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE INDEX IF NOT EXISTS idx_domain_events_outbox_owner_created
  ON public.domain_events_outbox (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_outbox_aggregate
  ON public.domain_events_outbox (aggregate_type, aggregate_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_domain_events_outbox_command
  ON public.domain_events_outbox (command_id);

GRANT SELECT ON public.domain_events_outbox TO authenticated;
GRANT ALL    ON public.domain_events_outbox TO service_role;

ALTER TABLE public.domain_events_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_own_scope" ON public.domain_events_outbox;
CREATE POLICY "events_select_own_scope"
  ON public.domain_events_outbox
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR owner_id = public.get_team_owner_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP TRIGGER IF EXISTS trg_domain_events_outbox_updated_at ON public.domain_events_outbox;
CREATE TRIGGER trg_domain_events_outbox_updated_at
  BEFORE UPDATE ON public.domain_events_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_command_flag_enabled_v1(p_owner uuid, p_flag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT (cs.feature_flags ->> p_flag) = 'true'
       FROM public.company_settings cs
      WHERE cs.user_id = p_owner
      LIMIT 1),
    false);
$$;

CREATE OR REPLACE FUNCTION public.emit_domain_event_v1(
  p_event_type     text,
  p_event_version  int,
  p_aggregate_type text,
  p_aggregate_id   uuid,
  p_owner_id       uuid,
  p_actor_id       uuid,
  p_company_id     uuid,
  p_branch_id      uuid,
  p_command_id     uuid,
  p_correlation_id uuid,
  p_causation_id   uuid,
  p_dedupe_key     text,
  p_effective_at   timestamptz,
  p_payload        jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_dedupe_key IS NULL OR p_event_type IS NULL THEN
    RAISE EXCEPTION 'emit_domain_event_v1: owner_id, event_type and dedupe_key are required'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.domain_events_outbox (
    event_id, event_type, event_version, aggregate_type, aggregate_id,
    owner_id, actor_id, company_id, branch_id,
    command_id, correlation_id, causation_id, dedupe_key,
    occurred_at, effective_at, payload, status, next_attempt_at
  ) VALUES (
    gen_random_uuid(), p_event_type, COALESCE(p_event_version,1), p_aggregate_type, p_aggregate_id,
    p_owner_id, p_actor_id, p_company_id, p_branch_id,
    p_command_id, p_correlation_id, p_causation_id, p_dedupe_key,
    now(), p_effective_at, COALESCE(p_payload,'{}'::jsonb), 'pending', now()
  )
  ON CONFLICT (owner_id, event_type, dedupe_key) DO NOTHING
  RETURNING event_id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT event_id INTO v_event_id
      FROM public.domain_events_outbox
     WHERE owner_id = p_owner_id
       AND event_type = p_event_type
       AND dedupe_key = p_dedupe_key
     LIMIT 1;
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_domain_event_v1(
  text,int,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.domain_events_outbox_health_v1
WITH (security_invoker = true) AS
SELECT
  owner_id,
  event_type,
  count(*)                                                     AS event_count,
  count(*) FILTER (WHERE status = 'pending')                   AS pending_count,
  count(*) FILTER (WHERE status = 'processed')                 AS processed_count,
  count(*) FILTER (WHERE attempt_count > 0 AND status <> 'processed') AS retry_count,
  count(*) FILTER (WHERE status = 'dead_letter')               AS dead_letter_count,
  max(attempt_count)                                           AS max_attempts,
  min(created_at) FILTER (WHERE status = 'pending')            AS oldest_pending_at,
  EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status = 'pending')))::bigint
                                                               AS oldest_pending_age_seconds
FROM public.domain_events_outbox
GROUP BY owner_id, event_type;

GRANT SELECT ON public.domain_events_outbox_health_v1 TO authenticated;
GRANT SELECT ON public.domain_events_outbox_health_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_domain_events_v1(
  p_limit int DEFAULT 50,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id FROM public.domain_events_outbox
     WHERE status IN ('pending','failed')
       AND (next_attempt_at IS NULL OR next_attempt_at <= now())
     ORDER BY occurred_at
     LIMIT GREATEST(1, LEAST(p_limit, 500))
     FOR UPDATE SKIP LOCKED
  ) q;

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('claimed', 0, 'dry_run', p_dry_run);
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object('claimed', array_length(v_ids,1), 'dry_run', true);
  END IF;

  UPDATE public.domain_events_outbox
     SET status = 'processed',
         processed_at = now(),
         attempt_count = attempt_count + 1
   WHERE id = ANY(v_ids);

  RETURN jsonb_build_object('claimed', array_length(v_ids,1), 'dry_run', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_domain_events_v1(int, boolean) FROM PUBLIC, anon;

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