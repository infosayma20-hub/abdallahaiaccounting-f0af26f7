-- ============================================================
-- Server-side Receipt Print Tracking (Root Fix for silent print failures)
-- Adds three nullable columns + one SECURITY DEFINER RPC.
-- No existing logic touched. All defaults are NULL so historical
-- rows remain untouched (interpreted as "unknown / legacy").
-- ============================================================

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS receipt_print_status TEXT
    CHECK (receipt_print_status IN ('pending','sent','failed','skipped')),
  ADD COLUMN IF NOT EXISTS receipt_print_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_last_print_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_last_print_error TEXT;

-- Fast lookup for "which orders in this session didn't print?"
CREATE INDEX IF NOT EXISTS idx_pos_orders_session_print_status
  ON public.pos_orders (session_id, receipt_print_status)
  WHERE receipt_print_status IN ('pending','failed');

-- ------------------------------------------------------------
-- RPC: record_pos_receipt_print(order_id, status, error)
-- Called by the POS client after each /print-receipt call.
-- SECURITY DEFINER + strict tenant check (uses same owner
-- resolution as the rest of the app).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_pos_receipt_print(
  p_order_id UUID,
  p_status   TEXT,
  p_error    TEXT DEFAULT NULL
)
RETURNS TABLE (
  order_id UUID,
  new_status TEXT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_owner UUID;
  v_order_owner  UUID;
BEGIN
  -- Validate status
  IF p_status NOT IN ('pending','sent','failed','skipped') THEN
    RAISE EXCEPTION 'invalid_status: %', p_status
      USING ERRCODE = '22023';
  END IF;

  -- Resolve effective owner for the caller (staff/accountant/owner)
  v_caller_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Verify the order belongs to the caller's tenant
  SELECT o.user_id INTO v_order_owner
    FROM public.pos_orders o
   WHERE o.id = p_order_id;

  IF v_order_owner IS NULL THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order_owner <> v_caller_owner THEN
    RAISE EXCEPTION 'forbidden_owner_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Update status. attempts++ on every call so we can see retries.
  RETURN QUERY
    UPDATE public.pos_orders o
       SET receipt_print_status     = p_status,
           receipt_print_attempts   = COALESCE(o.receipt_print_attempts,0) + 1,
           receipt_last_print_at    = now(),
           receipt_last_print_error = CASE WHEN p_status = 'sent' THEN NULL ELSE p_error END,
           updated_at               = now()
     WHERE o.id = p_order_id
   RETURNING o.id, o.receipt_print_status, o.receipt_print_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pos_receipt_print(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pos_receipt_print(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pos_receipt_print(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.record_pos_receipt_print(UUID, TEXT, TEXT) IS
  'POS client calls this after each /print-receipt request. Tracks whether the printer actually acknowledged the job so cashiers/accountants can spot silent print failures within a shift.';
