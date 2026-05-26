-- 1) Secure RPC: only a user with an OPEN pos_session on the order's
--    target_branch_id (within the same tenant) can stamp delivery ACK.
CREATE OR REPLACE FUNCTION public.ack_call_center_order(
  p_order_id uuid,
  p_device_tag text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_branch uuid;
  v_already timestamptz;
  v_has_session boolean;
BEGIN
  SELECT user_id, target_branch_id, delivered_at
    INTO v_owner, v_branch, v_already
  FROM public.call_center_orders
  WHERE id = p_order_id;

  IF v_owner IS NULL THEN
    RETURN false;
  END IF;

  -- Tenant check: caller must be in the order owner's team.
  IF NOT public.is_team_member(auth.uid(), v_owner) THEN
    RETURN false;
  END IF;

  -- First-writer-wins: never overwrite an existing ACK.
  IF v_already IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Branch binding: caller must have an OPEN pos_session whose cash_box
  -- belongs to the order's target branch.
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_sessions s
    JOIN public.cash_boxes b ON b.id = s.cash_box_id
    WHERE s.opened_by = auth.uid()
      AND s.state = 'open'
      AND s.user_id = v_owner
      AND b.branch_id = v_branch
  ) INTO v_has_session;

  IF NOT v_has_session THEN
    RETURN false;
  END IF;

  UPDATE public.call_center_orders
    SET delivered_at = now(),
        delivered_to_device = COALESCE(p_device_tag, 'unknown-device')
  WHERE id = p_order_id
    AND delivered_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.ack_call_center_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_call_center_order(uuid, text) TO authenticated;

-- 2) Defense-in-depth: block direct client UPDATE on the ACK columns.
--    Other columns remain updatable by team members under the existing RLS.
REVOKE UPDATE (delivered_at, delivered_to_device)
  ON public.call_center_orders
  FROM authenticated, anon;