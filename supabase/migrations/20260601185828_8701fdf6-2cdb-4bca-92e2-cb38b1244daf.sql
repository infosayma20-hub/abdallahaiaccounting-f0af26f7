-- ============================================================
-- Call-center order edit locking — atomic, race-safe
-- ============================================================

ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS is_editing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editing_by UUID,
  ADD COLUMN IF NOT EXISTS editing_by_name TEXT,
  ADD COLUMN IF NOT EXISTS editing_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cco_branch_status_editing
  ON public.call_center_orders(target_branch_id, status, is_editing);

-- ---------- start_editing ----------
CREATE OR REPLACE FUNCTION public.start_editing_call_center_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_row public.call_center_orders%ROWTYPE;
  v_stale_cutoff timestamptz := now() - interval '15 minutes';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT display_name INTO v_name
    FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  -- Lock the row to prevent races with the cashier acceptance flow.
  SELECT * INTO v_row FROM public.call_center_orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT public.is_team_member(v_uid, v_row.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted', 'status', v_row.status);
  END IF;

  -- Allow steal-over only if previous edit lock is stale (>15 min) or already mine.
  IF v_row.is_editing
     AND v_row.editing_by IS DISTINCT FROM v_uid
     AND COALESCE(v_row.editing_started_at, 'epoch'::timestamptz) > v_stale_cutoff
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked_by_other',
      'editing_by_name', v_row.editing_by_name
    );
  END IF;

  UPDATE public.call_center_orders
     SET is_editing = true,
         editing_by = v_uid,
         editing_by_name = COALESCE(v_name, 'كول سنتر'),
         editing_started_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_editing_call_center_order(uuid) TO authenticated;

-- ---------- finish_editing ----------
CREATE OR REPLACE FUNCTION public.finish_editing_call_center_order(
  p_order_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_type text,
  p_delivery_address text,
  p_payment_method text,
  p_source_app text,
  p_items jsonb,
  p_total numeric,
  p_order_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.call_center_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT * INTO v_row FROM public.call_center_orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT public.is_team_member(v_uid, v_row.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted', 'status', v_row.status);
  END IF;

  -- Edit lock must still belong to this user (or no lock at all, e.g. first save).
  IF v_row.is_editing AND v_row.editing_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lock_lost');
  END IF;

  UPDATE public.call_center_orders
     SET customer_name    = p_customer_name,
         customer_phone   = p_customer_phone,
         delivery_type    = p_delivery_type,
         delivery_address = p_delivery_address,
         payment_method   = CASE WHEN p_payment_method LIKE 'visa%' THEN 'visa' ELSE 'cash' END,
         source_app       = COALESCE(p_source_app, source_app),
         items            = p_items,
         total            = p_total,
         order_note       = p_order_note,
         is_editing       = false,
         editing_by       = null,
         editing_by_name  = null,
         editing_started_at = null,
         updated_at       = now()
   WHERE id = p_order_id
     AND status = 'pending'; -- final race-safe guard

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_editing_call_center_order(
  uuid, text, text, text, text, text, text, jsonb, numeric, text
) TO authenticated;

-- ---------- cancel_editing ----------
CREATE OR REPLACE FUNCTION public.cancel_editing_call_center_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.call_center_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT * INTO v_row FROM public.call_center_orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true); -- nothing to do
  END IF;

  IF NOT public.is_team_member(v_uid, v_row.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Only the lock owner (or stale lock) may clear.
  IF v_row.is_editing AND v_row.editing_by = v_uid THEN
    UPDATE public.call_center_orders
       SET is_editing = false,
           editing_by = null,
           editing_by_name = null,
           editing_started_at = null,
           updated_at = now()
     WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_editing_call_center_order(uuid) TO authenticated;