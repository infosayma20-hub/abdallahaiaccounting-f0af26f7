-- Soft-cancel for dispatched call-center orders (before branch acceptance).

ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Atomic, race-safe cancel:
--   * Only the dispatcher (dispatched_by) or an admin may cancel.
--   * Allowed ONLY while still pending, not accepted, and never invoiced.
--   * Returns explicit reasons so the UI can show a clear toast.
--   * Stamps cancellation metadata + clears any stale edit lock.
CREATE OR REPLACE FUNCTION public.cancel_dispatched_call_center_order(
  p_order_id uuid,
  p_reason   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text;
  v_row      public.call_center_orders%ROWTYPE;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reason_required');
  END IF;

  SELECT * INTO v_row
    FROM public.call_center_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT public.is_team_member(v_uid, v_row.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::public.app_role);

  IF NOT v_is_admin AND v_row.dispatched_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner');
  END IF;

  IF v_row.status <> 'pending'
     OR v_row.accepted_at IS NOT NULL
     OR v_row.pos_order_id IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_accepted',
      'status', v_row.status
    );
  END IF;

  SELECT display_name INTO v_name
    FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.call_center_orders
     SET status             = 'cancelled',
         cancelled_at       = now(),
         cancelled_by       = v_uid,
         cancelled_by_name  = COALESCE(v_name, 'موظف'),
         cancel_reason      = btrim(p_reason),
         is_editing         = false,
         editing_by         = null,
         editing_by_name    = null,
         editing_started_at = null,
         updated_at         = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_dispatched_call_center_order(uuid, text) TO authenticated;