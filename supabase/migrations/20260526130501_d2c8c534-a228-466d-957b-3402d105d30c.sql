-- 1) Table for edit proposals
CREATE TABLE public.call_center_order_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  call_center_order_id uuid NOT NULL REFERENCES public.call_center_orders(id) ON DELETE CASCADE,
  target_branch_id uuid,
  proposed_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  edit_note text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','accepted','rejected')),
  created_by uuid,
  created_by_name text,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cco_edits_order ON public.call_center_order_edits(call_center_order_id);
CREATE INDEX idx_cco_edits_branch_pending ON public.call_center_order_edits(target_branch_id) WHERE status='pending_review';

ALTER TABLE public.call_center_order_edits ENABLE ROW LEVEL SECURITY;

-- Team members may read and insert proposals; updates go only through RPCs.
CREATE POLICY "Team members can read order edits"
  ON public.call_center_order_edits FOR SELECT
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team members can insert order edits"
  ON public.call_center_order_edits FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Block all direct client UPDATE / DELETE on this table.
REVOKE UPDATE, DELETE ON public.call_center_order_edits FROM authenticated, anon;

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_center_order_edits;

-- 2) Helper: which fields are allowed to change via an edit proposal.
--    Anything outside this whitelist is silently ignored.
CREATE OR REPLACE FUNCTION public._apply_cco_edit_changes(
  p_order_id uuid,
  p_changes jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.call_center_orders SET
    customer_name    = COALESCE(p_changes->>'customer_name', customer_name),
    customer_phone   = COALESCE(p_changes->>'customer_phone', customer_phone),
    delivery_type    = COALESCE(p_changes->>'delivery_type', delivery_type),
    delivery_address = COALESCE(p_changes->>'delivery_address', delivery_address),
    payment_method   = COALESCE(p_changes->>'payment_method', payment_method),
    order_note       = COALESCE(p_changes->>'order_note', order_note),
    items            = COALESCE(p_changes->'items', items),
    total            = COALESCE((p_changes->>'total')::numeric, total),
    updated_at       = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_cco_edit_changes(uuid, jsonb) FROM PUBLIC;

-- 3) Accept edit: cashier on the target branch only.
CREATE OR REPLACE FUNCTION public.accept_order_edit(p_edit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_order uuid;
  v_branch uuid;
  v_status text;
  v_invoiced uuid;
  v_changes jsonb;
  v_actor_name text;
BEGIN
  SELECT e.user_id, e.call_center_order_id, e.target_branch_id, e.status, e.proposed_changes
    INTO v_owner, v_order, v_branch, v_status, v_changes
  FROM public.call_center_order_edits e
  WHERE e.id = p_edit_id;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'edit_not_found'; END IF;
  IF NOT public.is_team_member(auth.uid(), v_owner) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_status <> 'pending_review' THEN RAISE EXCEPTION 'edit_already_decided'; END IF;

  -- Order must still be editable (not invoiced).
  SELECT pos_order_id INTO v_invoiced FROM public.call_center_orders WHERE id = v_order;
  IF v_invoiced IS NOT NULL THEN RAISE EXCEPTION 'order_already_invoiced'; END IF;

  -- Caller must have an OPEN pos_session on the target branch.
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_sessions s
    JOIN public.cash_boxes b ON b.id = s.cash_box_id
    WHERE s.opened_by = auth.uid()
      AND s.state = 'open'
      AND s.user_id = v_owner
      AND b.branch_id = v_branch
  ) THEN
    RAISE EXCEPTION 'cashier_session_required';
  END IF;

  PERFORM public._apply_cco_edit_changes(v_order, v_changes);

  SELECT display_name INTO v_actor_name FROM public.profiles WHERE user_id = auth.uid();

  UPDATE public.call_center_order_edits
    SET status = 'accepted',
        decided_by = auth.uid(),
        decided_by_name = v_actor_name,
        decided_at = now(),
        updated_at = now()
  WHERE id = p_edit_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_order_edit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_order_edit(uuid) TO authenticated;

-- 4) Reject edit: same authorization.
CREATE OR REPLACE FUNCTION public.reject_order_edit(p_edit_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_branch uuid;
  v_status text;
  v_actor_name text;
BEGIN
  SELECT user_id, target_branch_id, status
    INTO v_owner, v_branch, v_status
  FROM public.call_center_order_edits
  WHERE id = p_edit_id;

  IF v_owner IS NULL THEN RAISE EXCEPTION 'edit_not_found'; END IF;
  IF NOT public.is_team_member(auth.uid(), v_owner) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_status <> 'pending_review' THEN RAISE EXCEPTION 'edit_already_decided'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pos_sessions s
    JOIN public.cash_boxes b ON b.id = s.cash_box_id
    WHERE s.opened_by = auth.uid()
      AND s.state = 'open'
      AND s.user_id = v_owner
      AND b.branch_id = v_branch
  ) THEN
    RAISE EXCEPTION 'cashier_session_required';
  END IF;

  SELECT display_name INTO v_actor_name FROM public.profiles WHERE user_id = auth.uid();

  UPDATE public.call_center_order_edits
    SET status = 'rejected',
        decided_by = auth.uid(),
        decided_by_name = v_actor_name,
        decided_at = now(),
        reject_reason = p_reason,
        updated_at = now()
  WHERE id = p_edit_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_edit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_order_edit(uuid, text) TO authenticated;