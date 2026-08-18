CREATE OR REPLACE FUNCTION public.kiosk_pinpad_terminal_id(ks public.kiosk_settings)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    ks.visa_pinpad_terminal_id,
    CASE WHEN ks.visa_terminal_id ~ '^[0-9a-fA-F-]{36}$' THEN ks.visa_terminal_id::uuid END
  );
$$;

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
  WHERE t.id = public.kiosk_pinpad_terminal_id(ks) AND t.is_active = true;

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

  SELECT * INTO t FROM public.bop_pinpad_terminals WHERE id = public.kiosk_pinpad_terminal_id(ks);
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