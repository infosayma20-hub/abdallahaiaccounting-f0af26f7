CREATE OR REPLACE FUNCTION public.create_kiosk_call_center_order(
  p_branch_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb,
  p_total numeric,
  p_order_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.kiosk_settings%ROWTYPE;
  v_branch_name text;
  v_order_id uuid;
  v_order_number text;
  v_clean_payment text;
BEGIN
  SELECT * INTO v_settings
  FROM public.kiosk_settings
  WHERE branch_id = p_branch_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'kiosk_inactive');
  END IF;

  IF v_settings.require_name AND length(trim(coalesce(p_customer_name, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'name_required');
  END IF;

  IF v_settings.require_phone AND length(regexp_replace(coalesce(p_customer_phone, ''), '\\D', '', 'g')) < 7 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_required');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_cart');
  END IF;

  v_clean_payment := CASE WHEN lower(coalesce(p_payment_method, 'cashier')) IN ('card', 'visa') THEN 'visa' ELSE 'cash' END;

  SELECT name INTO v_branch_name
  FROM public.branches
  WHERE id = p_branch_id
    AND user_id = v_settings.user_id
    AND is_active = true
  LIMIT 1;

  IF v_branch_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'branch_not_found');
  END IF;

  v_order_number := 'K' || to_char(clock_timestamp(), 'HH24MISSMS');

  INSERT INTO public.call_center_orders (
    user_id,
    source_app,
    target_branch_id,
    target_branch_name,
    customer_name,
    customer_phone,
    delivery_type,
    delivery_address,
    payment_method,
    items,
    total,
    order_note,
    status,
    dispatched_by_name,
    delivery_fee,
    delivery_info,
    skip_wheels_dispatch
  ) VALUES (
    v_settings.user_id,
    'KIOSK',
    p_branch_id,
    v_branch_name,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    'pickup',
    NULL,
    v_clean_payment,
    p_items,
    greatest(coalesce(p_total, 0), 0),
    concat_ws(E'\n', 'طلبية كيوسك - استلام فقط', 'رقم الكيوسك: ' || v_order_number, nullif(trim(coalesce(p_order_note, '')), '')),
    'pending',
    'KIOSK',
    0,
    jsonb_build_object('source', 'kiosk', 'order_number', v_order_number, 'branch_id', p_branch_id),
    true
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'order_number', v_order_number);
END;
$$;

REVOKE ALL ON FUNCTION public.create_kiosk_call_center_order(uuid, text, text, text, jsonb, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_kiosk_call_center_order(uuid, text, text, text, jsonb, numeric, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_kiosk_call_center_order(uuid, text, text, text, jsonb, numeric, text) TO authenticated;
GRANT ALL ON FUNCTION public.create_kiosk_call_center_order(uuid, text, text, text, jsonb, numeric, text) TO service_role;