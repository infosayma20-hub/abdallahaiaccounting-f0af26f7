CREATE OR REPLACE FUNCTION public.create_kiosk_call_center_order(
  p_branch_id uuid,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'cashier'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_total numeric DEFAULT 0,
  p_order_note text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_settings public.kiosk_settings%ROWTYPE;
  v_branch_name text;
  v_order_id uuid;
  v_order_number text;
  v_seq integer;
  v_business_date date;
  v_cutoff_hour integer := 6;
  v_lock_key bigint;
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

  IF EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Hebron') < v_cutoff_hour THEN
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date - INTERVAL '1 day';
  ELSE
    v_business_date := (now() AT TIME ZONE 'Asia/Hebron')::date;
  END IF;

  v_lock_key := abs(hashtextextended(
    'kiosk_order_number:' || v_settings.user_id::text || p_branch_id::text || v_business_date::text, 91));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT GREATEST(
    COALESCE((
      SELECT MAX(po.daily_display_number)
      FROM public.pos_orders po
      LEFT JOIN public.pos_sessions s ON s.id = po.session_id
      LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
      WHERE po.user_id = v_settings.user_id
        AND COALESCE(po.branch_id, t.branch_id) = p_branch_id
        AND po.daily_display_number < 10000
        AND po.created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
        AND po.created_at <  (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
    ), 0),
    COALESCE((
      SELECT MAX(seq) FROM (
        SELECT NULLIF(regexp_replace(COALESCE(cco.delivery_info->>'order_number',''), '\D', '', 'g'), '')::bigint AS seq
        FROM public.call_center_orders cco
        WHERE cco.user_id = v_settings.user_id
          AND cco.target_branch_id = p_branch_id
          AND cco.source_app = 'KIOSK'
          AND cco.created_at >= (v_business_date + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
          AND cco.created_at <  (v_business_date + INTERVAL '1 day' + (v_cutoff_hour || ' hours')::interval) AT TIME ZONE 'Asia/Hebron'
      ) q WHERE seq < 10000
    ), 0)::int
  ) + 1 INTO v_seq;

  v_order_number := 'K' || v_seq::text;
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
    jsonb_build_object('source', 'kiosk', 'order_number', v_order_number,
                       'kiosk_seq', v_seq, 'branch_id', p_branch_id,
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