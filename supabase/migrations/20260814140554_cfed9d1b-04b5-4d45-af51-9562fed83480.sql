CREATE OR REPLACE FUNCTION public.ack_call_center_order(p_order_id uuid, p_device_tag text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_owner IS NULL THEN RETURN false; END IF;
  IF NOT public.is_team_member(auth.uid(), v_owner) THEN RETURN false; END IF;
  IF v_already IS NOT NULL THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.pos_sessions s
    LEFT JOIN public.cash_boxes b ON b.id = s.cash_box_id
    WHERE s.cashier_auth_user_id = auth.uid()
      AND s.state = 'open'
      AND COALESCE(s.is_deleted, false) = false
      AND s.user_id = v_owner
      AND COALESCE(s.branch_id, b.branch_id) = v_branch
  ) INTO v_has_session;

  IF NOT v_has_session THEN RETURN false; END IF;

  UPDATE public.call_center_orders
    SET delivered_at = now(),
        delivered_to_device = COALESCE(p_device_tag, 'unknown-device')
  WHERE id = p_order_id
    AND delivered_at IS NULL;

  RETURN FOUND;
END;
$function$;