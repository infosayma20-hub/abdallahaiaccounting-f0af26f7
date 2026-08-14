CREATE OR REPLACE FUNCTION public.reject_order_edit(p_edit_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    LEFT JOIN public.cash_boxes b ON b.id = s.cash_box_id
    WHERE s.cashier_auth_user_id = auth.uid()
      AND s.state = 'open'
      AND COALESCE(s.is_deleted, false) = false
      AND s.user_id = v_owner
      AND COALESCE(s.branch_id, b.branch_id) = v_branch
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
$function$;

CREATE OR REPLACE FUNCTION public.accept_order_edit(p_edit_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT pos_order_id INTO v_invoiced FROM public.call_center_orders WHERE id = v_order;
  IF v_invoiced IS NOT NULL THEN RAISE EXCEPTION 'order_already_invoiced'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pos_sessions s
    LEFT JOIN public.cash_boxes b ON b.id = s.cash_box_id
    WHERE s.cashier_auth_user_id = auth.uid()
      AND s.state = 'open'
      AND COALESCE(s.is_deleted, false) = false
      AND s.user_id = v_owner
      AND COALESCE(s.branch_id, b.branch_id) = v_branch
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
$function$;