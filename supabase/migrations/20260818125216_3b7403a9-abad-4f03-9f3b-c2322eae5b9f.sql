ALTER TABLE public.kiosk_settings
  ADD COLUMN IF NOT EXISTS visa_pinpad_terminal_id uuid
  REFERENCES public.bop_pinpad_terminals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.get_kiosk_bootstrap(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ks public.kiosk_settings%ROWTYPE;
  v_logo text;
  v_pinpad jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO ks FROM public.kiosk_settings
  WHERE access_code = lower(trim(p_code)) AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT logo_url INTO v_logo FROM public.company_settings WHERE user_id = ks.user_id LIMIT 1;

  SELECT jsonb_build_object(
           'id', t.id, 'label', t.label, 'ip_address', t.ip_address,
           'port', t.port, 'branch_id', t.branch_id)
    INTO v_pinpad
  FROM public.bop_pinpad_terminals t
  WHERE t.id = ks.visa_pinpad_terminal_id AND t.is_active = true;

  v_result := jsonb_build_object(
    'ok', true,
    'settings', jsonb_build_object(
      'id', ks.id,
      'user_id', ks.user_id,
      'branch_id', ks.branch_id,
      'is_active', ks.is_active,
      'default_language', ks.default_language,
      'welcome_image_url', ks.welcome_image_url,
      'logo_url', ks.logo_url,
      'primary_color', ks.primary_color,
      'idle_timeout_seconds', ks.idle_timeout_seconds,
      'receipt_printer_id', ks.receipt_printer_id,
      'require_phone', ks.require_phone,
      'require_name', ks.require_name,
      'has_pinpad', v_pinpad IS NOT NULL
    ),
    'pinpad', v_pinpad,
    'company_logo', v_logo,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'display_order', c.display_order) ORDER BY c.display_order NULLS LAST, c.name)
      FROM public.pos_categories c WHERE c.user_id = ks.user_id AND c.is_active = true
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'price', p.sell_price, 'image_url', p.image_url,
        'category_id', p.pos_category_id, 'is_pos_available', p.is_pos_available, 'description', p.description))
      FROM public.products p WHERE p.user_id = ks.user_id AND p.is_pos_available = true
    ), '[]'::jsonb),
    'product_modifier_groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('product_id', pmg.product_id, 'group_id', pmg.group_id))
      FROM public.product_modifier_groups pmg
      JOIN public.products p2 ON p2.id = pmg.product_id AND p2.user_id = ks.user_id
    ), '[]'::jsonb),
    'modifier_groups', COALESCE((
      SELECT jsonb_agg(to_jsonb(g)) FROM public.modifier_groups g
      WHERE g.user_id = ks.user_id AND COALESCE(g.is_active, true) = true
    ), '[]'::jsonb),
    'modifier_options', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.sort_order NULLS LAST)
      FROM public.modifier_options o
      JOIN public.modifier_groups g2 ON g2.id = o.group_id AND g2.user_id = ks.user_id
      WHERE COALESCE(o.is_active, true) = true
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_kiosk_pinpad_tx(
  p_access_code text,
  p_op_type text,
  p_receipt text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT 'ILS',
  p_response jsonb DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_error_msg text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ks public.kiosk_settings%ROWTYPE;
  t public.bop_pinpad_terminals%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO ks FROM public.kiosk_settings
   WHERE access_code = lower(trim(coalesce(p_access_code,''))) AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'kiosk_not_found'); END IF;
  IF ks.visa_pinpad_terminal_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_terminal'); END IF;

  SELECT * INTO t FROM public.bop_pinpad_terminals WHERE id = ks.visa_pinpad_terminal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'terminal_missing'); END IF;

  IF coalesce(p_op_type,'') NOT IN ('SALE','SALE_CB','LOAN','VOID','RETURN','QUERY','BATCH','BATCH_TIME','QR') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_op');
  END IF;

  INSERT INTO public.bop_pinpad_transactions (
    data_owner_id, terminal_id, branch_id, pos_terminal_id, op_type,
    receipt_no, amount, currency, resp_code, auth_code, seq, stan,
    card_masked, card_type, entry_mode, aid, datim, is_success,
    error_msg, duration_ms, raw_response
  ) VALUES (
    t.data_owner_id, t.id, coalesce(t.branch_id, ks.branch_id), t.pos_terminal_id, p_op_type,
    nullif(trim(coalesce(p_receipt,'')),''), p_amount,
    CASE WHEN coalesce(p_currency,'ILS') IN ('ILS','USD','JOD') THEN coalesce(p_currency,'ILS') ELSE 'ILS' END,
    p_response->>'respCode', p_response->>'authCode', p_response->>'seq', p_response->>'stan',
    p_response->>'cardMasked', p_response->>'cardType', p_response->>'entry', p_response->>'aid',
    p_response->>'datim',
    coalesce((p_response->>'ok')::boolean, false) AND coalesce(p_response->>'respCode','') = '000',
    coalesce(nullif(trim(coalesce(p_error_msg,'')),''), p_response->>'errorMsg'),
    p_duration_ms, p_response
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.log_kiosk_pinpad_tx(text,text,text,numeric,text,jsonb,integer,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_kiosk_call_center_order(
  p_branch_id uuid,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'cashier'::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_total numeric DEFAULT 0,
  p_order_note text DEFAULT NULL::text,
  p_payment_ref jsonb DEFAULT NULL::jsonb
)
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
  v_seq integer;
  v_business_date date;
  v_cutoff_hour integer := 6;
  v_lock_key bigint;
  v_clean_payment text;
  v_visa_gl text;
  v_phone text;
  v_name text;
  v_pay_note text;
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

  IF v_clean_payment = 'visa' AND p_payment_ref IS NOT NULL THEN
    v_pay_note := concat_ws(' | ',
      'تفويض: ' || coalesce(p_payment_ref->>'authCode', '-'),
      'بطاقة: ' || coalesce(p_payment_ref->>'cardMasked', '-'),
      coalesce(p_payment_ref->>'cardType', NULL));
  END IF;

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
      v_pay_note,
      nullif(trim(coalesce(p_order_note, '')), '')),
    'pending', 'KIOSK', 0,
    jsonb_build_object('source', 'kiosk', 'order_number', v_order_number,
                       'kiosk_seq', v_seq, 'branch_id', p_branch_id,
                       'paid_at_kiosk', v_clean_payment = 'visa',
                       'payment_ref', p_payment_ref),
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