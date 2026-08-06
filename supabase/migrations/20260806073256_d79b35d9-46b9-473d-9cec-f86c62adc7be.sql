CREATE OR REPLACE FUNCTION public.get_branch_tracking_board(_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record;
  v_logo text;
  v_company text;
  v_orders jsonb;
  v_start timestamptz;
BEGIN
  SELECT * INTO b FROM branches WHERE public_slug = _slug LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  -- Business day starts at 06:00 local (Asia/Hebron)
  v_start := (date_trunc('day', (now() AT TIME ZONE 'Asia/Hebron') - interval '6 hours') + interval '6 hours') AT TIME ZONE 'Asia/Hebron';

  SELECT logo_url, name INTO v_logo, v_company FROM companies WHERE owner_id = b.user_id LIMIT 1;
  IF v_logo IS NULL THEN
    SELECT logo_url INTO v_logo FROM company_settings WHERE user_id = b.user_id LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'printed_at'), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT jsonb_build_object(
      'order_id', t.order_id,
      'order_number', t.order_number,
      'display_number', t.display_number,
      'order_type', t.order_type,
      'printed_at', t.printed_at,
      'delivered_at', t.delivered_at,
      'target_minutes', t.target_minutes,
      'elapsed_seconds', t.elapsed_seconds,
      'is_late', t.is_late,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'line_id', i.order_line_id,
          'product_name', i.product_name,
          'qty', i.qty,
          'printed_at', i.printed_at,
          'delivered_at', i.delivered_at,
          'target_minutes', i.target_minutes,
          'elapsed_seconds', i.elapsed_seconds,
          'is_late', i.is_late
        ) ORDER BY i.created_at), '[]'::jsonb)
        FROM pos_order_item_tracking i WHERE i.order_id = t.order_id
      )
    ) AS x
    FROM pos_order_tracking t
    WHERE t.branch_id = b.id
      AND t.is_cancelled = false
      AND t.printed_at >= v_start
      AND (t.delivered_at IS NULL OR t.delivered_at > now() - interval '30 minutes')
    ORDER BY t.printed_at
    LIMIT 200
  ) s;

  RETURN jsonb_build_object(
    'branch_id', b.id,
    'branch_name', b.name,
    'company_name', v_company,
    'logo_url', v_logo,
    'orders', v_orders
  );
END;
$function$;