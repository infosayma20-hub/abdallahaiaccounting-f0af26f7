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
  p_order_note text,
  p_delivery_fee numeric DEFAULT 0,
  p_delivery_info jsonb DEFAULT NULL
)
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

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted', 'status', v_row.status);
  END IF;

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
         delivery_fee     = COALESCE(p_delivery_fee, 0),
         delivery_info    = p_delivery_info,
         is_editing       = false,
         editing_by       = null,
         editing_by_name  = null,
         editing_started_at = null,
         updated_at       = now()
   WHERE id = p_order_id
     AND status = 'pending';

  RETURN jsonb_build_object('ok', true);
END;
$function$;