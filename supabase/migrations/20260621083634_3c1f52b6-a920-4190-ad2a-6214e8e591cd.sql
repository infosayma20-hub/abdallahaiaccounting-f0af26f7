
-- Re-do PHASE 1.4 + 1.5 + 2.5 + 3 with correct audit columns
-- (action / session_id / metadata instead of entity_type/entity_id/details)

-- 1.4
CREATE OR REPLACE FUNCTION public.enforce_pos_user_device_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos_user_id uuid;
  v_has_restrictions boolean;
  v_allowed boolean;
BEGIN
  SELECT id INTO v_pos_user_id
    FROM public.pos_users
   WHERE auth_user_id = NEW.cashier_auth_user_id
     AND user_id = NEW.user_id
   LIMIT 1;

  IF v_pos_user_id IS NULL OR NEW.terminal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.pos_user_device_access
     WHERE pos_user_id = v_pos_user_id AND can_login = true
  ) INTO v_has_restrictions;

  IF NOT v_has_restrictions THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.pos_user_device_access
     WHERE pos_user_id = v_pos_user_id
       AND device_id = NEW.terminal_id
       AND can_login = true
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'pos_user_not_allowed_on_this_device' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pos_user_device_access ON public.pos_sessions;
CREATE TRIGGER trg_enforce_pos_user_device_access
  BEFORE INSERT ON public.pos_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pos_user_device_access();

-- 1.5
ALTER TABLE public.cash_boxes
  ADD COLUMN IF NOT EXISTS active_session_id uuid,
  ADD COLUMN IF NOT EXISTS locked_by_device_id uuid;

CREATE OR REPLACE FUNCTION public.sync_cash_box_lock_from_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_box_id IS NOT NULL AND NEW.state = 'open' THEN
      UPDATE public.cash_boxes
         SET active_session_id = NEW.id,
             locked_by_device_id = NEW.terminal_id
       WHERE id = NEW.cash_box_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.cash_box_id IS NOT NULL THEN
    IF NEW.state = 'open' AND COALESCE(NEW.is_deleted,false) = false THEN
      UPDATE public.cash_boxes
         SET active_session_id = NEW.id,
             locked_by_device_id = COALESCE(NEW.active_device_id, NEW.terminal_id)
       WHERE id = NEW.cash_box_id
         AND (active_session_id IS NULL OR active_session_id = NEW.id);
    ELSE
      UPDATE public.cash_boxes
         SET active_session_id = NULL,
             locked_by_device_id = NULL
       WHERE id = NEW.cash_box_id
         AND active_session_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cash_box_lock ON public.pos_sessions;
CREATE TRIGGER trg_sync_cash_box_lock
  AFTER INSERT OR UPDATE ON public.pos_sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_cash_box_lock_from_session();

-- Fix claim_pos_session audit insert (was failing silently)
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

  IF v_row.active_device_fingerprint IS NOT DISTINCT FROM p_fingerprint THEN
    UPDATE public.pos_sessions
       SET active_device_id = p_device_id, last_heartbeat_at = now()
     WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', true, 'claimed', true, 'transferred', false);
  END IF;

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

  UPDATE public.pos_sessions
     SET active_device_id = p_device_id,
         active_device_fingerprint = p_fingerprint,
         last_heartbeat_at = now(),
         device_claim_count = device_claim_count + 1
   WHERE id = p_session_id;

  IF p_force AND v_row.active_device_fingerprint IS NOT NULL
     AND v_row.active_device_fingerprint <> p_fingerprint THEN
    BEGIN
      INSERT INTO public.pos_sensitive_actions_log
        (action, session_id, company_id, metadata)
      VALUES (
        'pos_session_force_claim',
        p_session_id,
        v_row.company_id,
        jsonb_build_object(
          'from_fingerprint', v_row.active_device_fingerprint,
          'to_fingerprint', p_fingerprint,
          'previous_last_seen', v_row.last_heartbeat_at,
          'caller', v_caller
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object('ok', true, 'claimed', true, 'transferred', p_force);
END;
$$;

-- 2.5
CREATE OR REPLACE FUNCTION public.sync_offline_pos_sale(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       UUID := (p_payload->>'user_id')::UUID;
  v_company_id    UUID := NULLIF(p_payload->>'company_id','')::UUID;
  v_session_id    UUID := NULLIF(p_payload->>'session_id','')::UUID;
  v_local_id      TEXT := p_payload->>'local_id';
  v_order_number  TEXT := p_payload->>'order_number';
  v_subtotal      NUMERIC := COALESCE((p_payload->>'subtotal')::NUMERIC,0);
  v_tax           NUMERIC := COALESCE((p_payload->>'tax_amount')::NUMERIC,0);
  v_discount      NUMERIC := COALESCE((p_payload->>'discount_amount')::NUMERIC,0);
  v_total         NUMERIC := COALESCE((p_payload->>'total')::NUMERIC,0);
  v_customer_id   UUID := NULLIF(p_payload->>'customer_id','')::UUID;
  v_customer_name TEXT := p_payload->>'customer_name';
  v_notes         TEXT := p_payload->>'notes';
  v_offline_at    TIMESTAMPTZ := COALESCE(NULLIF(p_payload->>'offline_created_at','')::TIMESTAMPTZ, now());
  v_lines         JSONB := COALESCE(p_payload->'items', '[]'::jsonb);
  v_payments      JSONB := COALESCE(p_payload->'payments', '[]'::jsonb);
  v_order_id      UUID;
  v_existing_id   UUID;
  v_existing_no   TEXT;
  v_line          JSONB;
  v_complete_res  JSONB;
  v_session_state TEXT;
  v_session_deleted BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_id is required');
  END IF;
  IF v_local_id IS NULL OR v_local_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'local_id is required for offline sync');
  END IF;

  SELECT id, order_number INTO v_existing_id, v_existing_no
  FROM public.pos_orders
  WHERE user_id = v_user_id AND local_id = v_local_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'order_id', v_existing_id, 'order_number', v_existing_no, 'duplicated', true);
  END IF;

  IF v_session_id IS NOT NULL THEN
    SELECT state, COALESCE(is_deleted,false) INTO v_session_state, v_session_deleted
    FROM public.pos_sessions WHERE id = v_session_id;
    IF v_session_state IS NULL OR v_session_deleted OR v_session_state <> 'open' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'session_not_open',
        'detail', 'الجلسة المرجعية أُغلقت — أعد إسناد الطلب لجلسة مفتوحة جديدة',
        'quarantine', true
      );
    END IF;
  END IF;

  INSERT INTO public.pos_orders (
    user_id, company_id, session_id,
    order_number, local_id, was_offline, sync_status, synced_at,
    customer_id, customer_name,
    subtotal, tax_amount, discount_amount, total,
    state, paid_at, order_note
  ) VALUES (
    v_user_id, v_company_id, v_session_id,
    v_order_number, v_local_id, TRUE, 'synced', now(),
    v_customer_id, v_customer_name,
    v_subtotal, v_tax, v_discount, v_total,
    'draft', v_offline_at, v_notes
  )
  RETURNING id INTO v_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.pos_order_lines (
      user_id, order_id,
      product_id, product_name,
      qty, unit, unit_price,
      discount_pct, discount_amount,
      tax_rate, tax_amount,
      subtotal, total, cost_price
    ) VALUES (
      v_user_id, v_order_id,
      NULLIF(v_line->>'product_id','')::UUID, v_line->>'product_name',
      COALESCE((v_line->>'qty')::NUMERIC,0),
      v_line->>'unit',
      COALESCE((v_line->>'unit_price')::NUMERIC,0),
      COALESCE((v_line->>'discount_pct')::NUMERIC,0),
      COALESCE((v_line->>'discount_amount')::NUMERIC,0),
      COALESCE((v_line->>'tax_rate')::NUMERIC,0),
      COALESCE((v_line->>'tax_amount')::NUMERIC,0),
      COALESCE((v_line->>'subtotal')::NUMERIC,0),
      COALESCE((v_line->>'total')::NUMERIC,0),
      COALESCE((v_line->>'cost_price')::NUMERIC,0)
    );
  END LOOP;

  BEGIN
    v_complete_res := public.complete_pos_order(v_order_id, v_user_id, v_payments);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pos_orders
       SET sync_status = 'failed', sync_error = SQLERRM,
           sync_retry_count = COALESCE(sync_retry_count,0) + 1
     WHERE id = v_order_id;
    RETURN jsonb_build_object('success', false, 'order_id', v_order_id, 'error', 'complete_pos_order failed: ' || SQLERRM);
  END;

  IF NOT COALESCE((v_complete_res->>'success')::BOOLEAN, false) THEN
    UPDATE public.pos_orders
       SET sync_status = 'failed',
           sync_error = COALESCE(v_complete_res->>'error', 'complete failed'),
           sync_retry_count = COALESCE(sync_retry_count,0) + 1
     WHERE id = v_order_id;
    RETURN jsonb_build_object('success', false, 'order_id', v_order_id, 'error', v_complete_res->>'error');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', COALESCE(v_complete_res->>'order_number', v_order_number),
    'duplicated', false
  );
END;
$function$;

-- Phase 3 — Conflict-detection view (corrected columns)
CREATE OR REPLACE VIEW public.pos_session_conflicts AS
SELECT
  s.id AS session_id,
  s.user_id,
  s.company_id,
  s.terminal_id,
  s.cashier_auth_user_id,
  s.cashier_name,
  s.opened_at,
  s.closed_at,
  s.state,
  s.device_claim_count,
  COALESCE(force_log.force_count, 0)::int AS force_claim_count,
  force_log.last_force_at
FROM public.pos_sessions s
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS force_count, MAX(created_at) AS last_force_at
    FROM public.pos_sensitive_actions_log l
   WHERE l.session_id = s.id
     AND l.action = 'pos_session_force_claim'
) force_log ON true
WHERE s.device_claim_count > 1
   OR COALESCE(force_log.force_count, 0) > 0;

GRANT SELECT ON public.pos_session_conflicts TO authenticated, service_role;
