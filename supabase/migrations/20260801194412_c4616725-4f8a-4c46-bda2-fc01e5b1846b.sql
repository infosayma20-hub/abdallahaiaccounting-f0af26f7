CREATE OR REPLACE FUNCTION public.create_kiosk_call_center_order(p_branch_id uuid, p_customer_name text, p_customer_phone text, p_payment_method text, p_items jsonb, p_total numeric, p_order_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.kiosk_settings%ROWTYPE;
  v_branch_name text;
  v_order_id uuid;
  v_order_number text;
  v_clean_payment text;
  v_visa_gl text;
  v_phone text;
  v_name text;
BEGIN
  SELECT * INTO v_settings FROM public.kiosk_settings
   WHERE branch_id = p_branch_id AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'kiosk_inactive'); END IF;

  IF v_settings.require_name AND length(trim(coalesce(p_customer_name, ''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'name_required'); END IF;
  IF v_settings.require_phone AND length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 7 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_required'); END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_cart'); END IF;

  v_clean_payment := CASE WHEN lower(coalesce(p_payment_method, 'cashier')) IN ('card', 'visa') THEN 'visa' ELSE 'cash' END;

  SELECT name INTO v_branch_name FROM public.branches
   WHERE id = p_branch_id AND user_id = v_settings.user_id AND is_active = true LIMIT 1;
  IF v_branch_name IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'branch_not_found'); END IF;

  IF v_clean_payment = 'visa' AND v_settings.visa_bank_account_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_visa_gl FROM public.bank_accounts
     WHERE id = v_settings.visa_bank_account_id AND user_id = v_settings.user_id;
  END IF;

  v_order_number := 'K' || to_char(clock_timestamp(), 'HH24MISSMS');
  v_name := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '');

  INSERT INTO public.call_center_orders (
    user_id, source_app, target_branch_id, target_branch_name,
    customer_name, customer_phone, delivery_type, delivery_address,
    payment_method, items, total, order_note, status,
    dispatched_by_name, delivery_fee, delivery_info, skip_wheels_dispatch,
    visa_gl_account_code
  ) VALUES (
    v_settings.user_id, 'KIOSK', p_branch_id, v_branch_name,
    v_name, nullif(trim(coalesce(p_customer_phone, '')), ''),
    'pickup', NULL, v_clean_payment, p_items, greatest(coalesce(p_total, 0), 0),
    concat_ws(E'\n', 'طلبية كيوسك - استلام فقط',
      'رقم الكيوسك: ' || v_order_number,
      CASE WHEN v_clean_payment='visa' THEN 'مدفوعة بالبطاقة على الكيوسك' ELSE 'الدفع على الكاشير' END,
      nullif(trim(coalesce(p_order_note, '')), '')),
    'pending', 'KIOSK', 0,
    jsonb_build_object('source', 'kiosk', 'order_number', v_order_number, 'branch_id', p_branch_id,
                       'paid_at_kiosk', v_clean_payment = 'visa'),
    true,
    v_visa_gl
  ) RETURNING id INTO v_order_id;

  IF v_phone IS NOT NULL AND length(v_phone) >= 7 THEN
    INSERT INTO public.pos_customers (user_id, name, whatsapp, total_visits, total_spent, last_visit)
    VALUES (v_settings.user_id, v_name, v_phone, 1, greatest(coalesce(p_total, 0), 0), now())
    ON CONFLICT (user_id, whatsapp) DO UPDATE
      SET name = COALESCE(NULLIF(trim(public.pos_customers.name), ''), EXCLUDED.name),
          total_visits = COALESCE(public.pos_customers.total_visits, 0) + 1,
          total_spent = COALESCE(public.pos_customers.total_spent, 0) + greatest(coalesce(p_total, 0), 0),
          last_visit = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', v_order_id, 'order_number', v_order_number, 'visa_gl', v_visa_gl);
END;
$function$;