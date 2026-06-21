
-- ========================================================================
-- PHASE 1: POS Session Single-Device Enforcement & Lost-Update Prevention
-- ========================================================================

-- 1.1 Add device tracking columns to pos_sessions
ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS active_device_id uuid,
  ADD COLUMN IF NOT EXISTS active_device_fingerprint text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS device_claim_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pos_sessions_active_device
  ON public.pos_sessions(active_device_id) WHERE state = 'open';

-- 1.1b Atomic increment to prevent Lost Updates on total_sales / total_orders
CREATE OR REPLACE FUNCTION public.increment_pos_session_totals(
  p_session_id uuid,
  p_sales_delta numeric,
  p_orders_delta integer
)
RETURNS TABLE(total_sales numeric, total_orders integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_user uuid;
  v_caller uuid := auth.uid();
BEGIN
  -- AuthZ: only the session owner (cashier_auth_user_id) or service role may increment
  SELECT cashier_auth_user_id INTO v_session_user
  FROM public.pos_sessions
  WHERE id = p_session_id AND state = 'open' AND COALESCE(is_deleted,false) = false;

  IF v_session_user IS NULL THEN
    RAISE EXCEPTION 'pos_session_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF v_caller IS NOT NULL AND v_caller <> v_session_user THEN
    RAISE EXCEPTION 'not_session_owner' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.pos_sessions s
     SET total_sales  = COALESCE(s.total_sales, 0)  + COALESCE(p_sales_delta, 0),
         total_orders = COALESCE(s.total_orders, 0) + COALESCE(p_orders_delta, 0),
         updated_at   = now()
   WHERE s.id = p_session_id
   RETURNING s.total_sales, s.total_orders;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_pos_session_totals(uuid, numeric, integer) TO authenticated, service_role;

-- 1.2 Claim a POS session for a specific device (with conflict detection)
CREATE OR REPLACE FUNCTION public.claim_pos_session(
  p_session_id uuid,
  p_device_id uuid,
  p_fingerprint text,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_sessions%ROWTYPE;
  v_caller uuid := auth.uid();
  v_stale_after interval := interval '60 seconds';
BEGIN
  SELECT * INTO v_row FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  IF v_row.state <> 'open' OR COALESCE(v_row.is_deleted, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_open');
  END IF;

  IF v_caller IS NOT NULL AND v_row.cashier_auth_user_id IS NOT NULL
     AND v_caller <> v_row.cashier_auth_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_session_owner');
  END IF;

  -- Already mine
  IF v_row.active_device_fingerprint IS NOT DISTINCT FROM p_fingerprint THEN
    UPDATE public.pos_sessions
       SET active_device_id = p_device_id,
           last_heartbeat_at = now()
     WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', true, 'claimed', true, 'transferred', false);
  END IF;

  -- Held by another live device?
  IF v_row.active_device_fingerprint IS NOT NULL
     AND v_row.last_heartbeat_at IS NOT NULL
     AND v_row.last_heartbeat_at > now() - v_stale_after
     AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'session_held_by_other_device',
      'other_device_id', v_row.active_device_id,
      'other_fingerprint', v_row.active_device_fingerprint,
      'last_seen', v_row.last_heartbeat_at
    );
  END IF;

  -- Claim (or force-transfer)
  UPDATE public.pos_sessions
     SET active_device_id = p_device_id,
         active_device_fingerprint = p_fingerprint,
         last_heartbeat_at = now(),
         device_claim_count = device_claim_count + 1
   WHERE id = p_session_id;

  -- Audit force transfers
  IF p_force AND v_row.active_device_fingerprint IS NOT NULL
     AND v_row.active_device_fingerprint <> p_fingerprint THEN
    BEGIN
      INSERT INTO public.pos_sensitive_actions_log
        (action_type, entity_type, entity_id, performed_by, details)
      VALUES (
        'pos_session_force_claim',
        'pos_session',
        p_session_id,
        v_caller,
        jsonb_build_object(
          'from_fingerprint', v_row.active_device_fingerprint,
          'to_fingerprint', p_fingerprint,
          'previous_last_seen', v_row.last_heartbeat_at
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'transferred', p_force);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pos_session(uuid, uuid, text, boolean) TO authenticated, service_role;

-- 1.3 Heartbeat — returns revoked=true if another device claimed the session
CREATE OR REPLACE FUNCTION public.heartbeat_pos_session(
  p_session_id uuid,
  p_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.pos_sessions WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'revoked', true, 'reason', 'session_not_found');
  END IF;

  IF v_row.state <> 'open' OR COALESCE(v_row.is_deleted, false) THEN
    RETURN jsonb_build_object('ok', false, 'revoked', true, 'reason', 'session_closed', 'closed_at', v_row.closed_at);
  END IF;

  IF v_row.active_device_fingerprint IS DISTINCT FROM p_fingerprint THEN
    RETURN jsonb_build_object(
      'ok', false,
      'revoked', true,
      'reason', 'device_replaced',
      'active_device_fingerprint', v_row.active_device_fingerprint,
      'last_seen', v_row.last_heartbeat_at
    );
  END IF;

  UPDATE public.pos_sessions
     SET last_heartbeat_at = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'revoked', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_pos_session(uuid, text) TO authenticated, service_role;

-- 1.4 Reconcile a session's totals from pos_orders (used by repair script + Super Admin button)
CREATE OR REPLACE FUNCTION public.reconcile_pos_session_totals(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales numeric;
  v_orders integer;
BEGIN
  SELECT COALESCE(SUM(total),0)::numeric, COUNT(*)::integer
    INTO v_sales, v_orders
  FROM public.pos_orders
  WHERE session_id = p_session_id
    AND COALESCE(is_deleted,false) = false
    AND status IN ('completed','paid');

  UPDATE public.pos_sessions
     SET total_sales = v_sales,
         total_orders = v_orders,
         updated_at = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'total_sales', v_sales, 'total_orders', v_orders);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_pos_session_totals(uuid) TO authenticated, service_role;
