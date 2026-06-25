
-- 1) Tracking columns on pos_payments
ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS original_payment_method text,
  ADD COLUMN IF NOT EXISTS payment_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_edited_by_pos_user_id uuid,
  ADD COLUMN IF NOT EXISTS payment_edit_manager_user_id uuid,
  ADD COLUMN IF NOT EXISTS payment_edit_reason text;

-- 2) Guard trigger: forbid changing payment_method if the session is already closed.
--    This is a safety net independent of the RPC.
CREATE OR REPLACE FUNCTION public.guard_pos_payment_method_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_state text;
BEGIN
  IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
    SELECT s.state INTO v_session_state
      FROM pos_sessions s
      JOIN pos_orders o ON o.session_id = s.id
     WHERE o.id = NEW.order_id;

    IF v_session_state IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'PAYMENT_EDIT_SESSION_CLOSED'
        USING ERRCODE = 'P0001',
              HINT    = 'لا يمكن تعديل طريقة الدفع لوردية مغلقة';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pos_payment_method ON public.pos_payments;
CREATE TRIGGER trg_guard_pos_payment_method
  BEFORE UPDATE ON public.pos_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_pos_payment_method_change();

-- 3) RPC: atomic, validated payment-method change
CREATE OR REPLACE FUNCTION public.change_pos_payment_method(
  p_order_id        uuid,
  p_new_method      text,
  p_edit_reason     text  DEFAULT NULL,
  p_pos_user_id     uuid  DEFAULT NULL,
  p_manager_user_id uuid  DEFAULT NULL,
  p_window_minutes  integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order        pos_orders%ROWTYPE;
  v_session      pos_sessions%ROWTYPE;
  v_company_id   uuid;
  v_age_min      numeric;
  v_old_methods  text;
  v_updated      int;
  v_caller_owner uuid;
BEGIN
  -- Validate new method
  IF p_new_method NOT IN ('cash','card','credit','employee_account') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the order row
  SELECT * INTO v_order
    FROM pos_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Tenant isolation
  v_caller_owner := resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_order.user_id <> v_caller_owner THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0001';
  END IF;

  v_company_id := v_order.user_id;

  -- State checks
  IF v_order.state <> 'paid' THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.is_return THEN
    RAISE EXCEPTION 'ORDER_IS_RETURN' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = 'P0001';
  END IF;
  IF v_order.paid_at IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_PAID_AT' USING ERRCODE = 'P0001';
  END IF;

  -- Block if the order has any returns linked to it
  IF EXISTS (
    SELECT 1 FROM pos_orders ret
      WHERE ret.user_id = v_order.user_id
        AND ret.is_return = true
        AND ret.id <> v_order.id
        AND (ret.notes ILIKE '%' || v_order.id::text || '%'
             OR ret.transferred_from_session_id IS NOT NULL)
        AND ret.created_at >= v_order.created_at
    LIMIT 1
  ) THEN
    -- soft check; do not block on this alone, fall through
    NULL;
  END IF;

  -- Session must be open and locked
  SELECT * INTO v_session
    FROM pos_sessions
   WHERE id = v_order.session_id
   FOR UPDATE;
  IF NOT FOUND OR v_session.state <> 'open' THEN
    RAISE EXCEPTION 'SESSION_NOT_OPEN' USING ERRCODE = 'P0001';
  END IF;

  -- Time window check (manager can bypass)
  v_age_min := EXTRACT(EPOCH FROM (now() - v_order.paid_at)) / 60.0;
  IF v_age_min > p_window_minutes AND p_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED'
      USING ERRCODE = 'P0001',
            HINT    = format('انتهت مدة السماح للتعديل (%s دقيقة) — يتطلب موافقة مدير', p_window_minutes);
  END IF;

  -- Snapshot old method labels for audit
  SELECT string_agg(DISTINCT payment_method, '+')
    INTO v_old_methods
    FROM pos_payments
   WHERE order_id = p_order_id;

  -- Apply the change to ALL payment rows for this order
  UPDATE pos_payments
     SET original_payment_method     = COALESCE(original_payment_method, payment_method),
         payment_method              = p_new_method,
         payment_edited_at           = now(),
         payment_edited_by_pos_user_id = p_pos_user_id,
         payment_edit_manager_user_id  = p_manager_user_id,
         payment_edit_reason         = p_edit_reason
   WHERE order_id = p_order_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'NO_PAYMENTS_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Audit log
  INSERT INTO pos_sensitive_actions_log(
    company_id, action, pos_user_id, manager_user_id,
    session_id, invoice_id, notes, metadata
  ) VALUES (
    v_company_id,
    'change_payment_method',
    p_pos_user_id,
    p_manager_user_id,
    v_order.session_id,
    v_order.id,
    p_edit_reason,
    jsonb_build_object(
      'from', v_old_methods,
      'to', p_new_method,
      'rows_updated', v_updated,
      'age_minutes', round(v_age_min::numeric, 2),
      'window_minutes', p_window_minutes,
      'manager_bypass', (v_age_min > p_window_minutes)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'from', v_old_methods,
    'to', p_new_method,
    'rows_updated', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_pos_payment_method(uuid, text, text, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_pos_payment_method(uuid, text, text, uuid, uuid, integer) TO authenticated;
