-- ─────────────────────────────────────────────────────────────────────
-- POS Concurrent Shift Protection
-- Prevents two devices from selling on the same cashier's session when
-- one device closes it, and prevents opening two sessions in parallel.
-- ─────────────────────────────────────────────────────────────────────

-- 1) Unique partial index: one open session per cashier per company
DROP INDEX IF EXISTS public.pos_sessions_one_open_per_cashier;
CREATE UNIQUE INDEX pos_sessions_one_open_per_cashier
  ON public.pos_sessions (company_id, cashier_pos_user_id)
  WHERE state = 'open' AND is_deleted = false AND cashier_pos_user_id IS NOT NULL;

-- Also guard the auth-user path (some sessions key on auth_user_id instead)
DROP INDEX IF EXISTS public.pos_sessions_one_open_per_auth_user;
CREATE UNIQUE INDEX pos_sessions_one_open_per_auth_user
  ON public.pos_sessions (company_id, cashier_auth_user_id)
  WHERE state = 'open' AND is_deleted = false AND cashier_auth_user_id IS NOT NULL;

-- 2) Trigger function: refuse writes when the session is not open
CREATE OR REPLACE FUNCTION public.pos_guard_session_open()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_state      text;
  v_deleted    boolean;
BEGIN
  -- Resolve the session id from whichever column the row carries.
  IF TG_TABLE_NAME = 'pos_orders' THEN
    v_session_id := NEW.session_id;
  ELSIF TG_TABLE_NAME = 'pos_payments' THEN
    SELECT session_id INTO v_session_id FROM pos_orders WHERE id = NEW.order_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_session_id IS NULL THEN
    RETURN NEW; -- nothing to enforce
  END IF;

  SELECT state, is_deleted INTO v_state, v_deleted
  FROM pos_sessions
  WHERE id = v_session_id;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'POS_SHIFT_NOT_FOUND'
      USING ERRCODE = 'P0001', HINT = 'pos_session_missing';
  END IF;

  IF v_deleted OR v_state <> 'open' THEN
    RAISE EXCEPTION 'POS_SHIFT_CLOSED'
      USING ERRCODE = 'P0001',
            HINT = 'pos_session_closed',
            DETAIL = format('session=%s state=%s', v_session_id, v_state);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_orders_guard_session_open ON public.pos_orders;
CREATE TRIGGER pos_orders_guard_session_open
  BEFORE INSERT OR UPDATE OF session_id, state ON public.pos_orders
  FOR EACH ROW
  WHEN (NEW.session_id IS NOT NULL)
  EXECUTE FUNCTION public.pos_guard_session_open();

DROP TRIGGER IF EXISTS pos_payments_guard_session_open ON public.pos_payments;
CREATE TRIGGER pos_payments_guard_session_open
  BEFORE INSERT ON public.pos_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_guard_session_open();

-- 3) Atomic close RPC (CAS — fails idempotently if already closed)
CREATE OR REPLACE FUNCTION public.close_pos_session_atomic(
  p_session_id   uuid,
  p_closing_cash numeric DEFAULT NULL,
  p_notes        text    DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  state           text,
  closed_at       timestamptz,
  already_closed  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row pos_sessions%ROWTYPE;
BEGIN
  -- Lock the row to avoid lost updates
  SELECT * INTO v_row FROM pos_sessions WHERE pos_sessions.id = p_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POS_SHIFT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.state <> 'open' THEN
    -- Already closed by another device — return current state instead of erroring.
    RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, true;
    RETURN;
  END IF;

  UPDATE pos_sessions
     SET state        = 'closed',
         closed_at    = now(),
         closing_cash = COALESCE(p_closing_cash, closing_cash),
         notes        = COALESCE(p_notes, notes),
         updated_at   = now()
   WHERE pos_sessions.id = p_session_id
     AND state = 'open'
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.state, v_row.closed_at, false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_pos_session_atomic(uuid, numeric, text) TO authenticated;

-- 4) Enable realtime on pos_sessions so the other device hears the close
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_sessions';
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication
  END;
END $$;

ALTER TABLE public.pos_sessions REPLICA IDENTITY FULL;
