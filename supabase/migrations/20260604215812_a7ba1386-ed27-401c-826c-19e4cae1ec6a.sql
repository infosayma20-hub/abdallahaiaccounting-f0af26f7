ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS editing_heartbeat_at timestamptz;

CREATE OR REPLACE FUNCTION public.start_editing_call_center_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_row public.call_center_orders%ROWTYPE;
  v_stale_cutoff timestamptz := now() - interval '3 minutes';
  v_last_alive timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT display_name INTO v_name
    FROM public.profiles WHERE user_id = v_uid LIMIT 1;

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

  v_last_alive := COALESCE(v_row.editing_heartbeat_at, v_row.editing_started_at, 'epoch'::timestamptz);

  IF v_row.is_editing
     AND v_row.editing_by IS DISTINCT FROM v_uid
     AND v_last_alive > v_stale_cutoff
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked_by_other',
      'editing_by_name', v_row.editing_by_name,
      'editing_since', v_last_alive
    );
  END IF;

  UPDATE public.call_center_orders
     SET is_editing = true,
         editing_by = v_uid,
         editing_by_name = COALESCE(v_name, 'كول سنتر'),
         editing_started_at = now(),
         editing_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_editing_call_center_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF NOT v_row.is_editing OR v_row.editing_by IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lock_lost');
  END IF;

  UPDATE public.call_center_orders
     SET editing_heartbeat_at = now(),
         updated_at = now()
   WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_release_editing_call_center_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_row public.call_center_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT display_name INTO v_name
    FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  SELECT * INTO v_row FROM public.call_center_orders
    WHERE id = p_order_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_uid <> v_row.user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF NOT v_row.is_editing THEN
    RETURN jsonb_build_object('ok', true, 'note', 'already_released');
  END IF;

  UPDATE public.call_center_orders
     SET is_editing = false,
         editing_by = null,
         editing_by_name = null,
         editing_started_at = null,
         editing_heartbeat_at = null,
         updated_at = now()
   WHERE id = p_order_id;

  BEGIN
    INSERT INTO public.pos_audit_log(user_id, action, cashier_id, cashier_name, reason, details)
    VALUES (
      v_row.user_id,
      'call_center_edit_lock_force_released',
      v_uid::text,
      COALESCE(v_name, 'admin'),
      'force release of stuck/expired edit lock',
      jsonb_build_object(
        'call_center_order_id', p_order_id,
        'previous_editor_id', v_row.editing_by,
        'previous_editor_name', v_row.editing_by_name,
        'editing_started_at', v_row.editing_started_at,
        'editing_heartbeat_at', v_row.editing_heartbeat_at
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.heartbeat_editing_call_center_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_release_editing_call_center_order(uuid) TO authenticated;