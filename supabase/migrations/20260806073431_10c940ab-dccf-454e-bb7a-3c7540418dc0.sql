CREATE OR REPLACE FUNCTION public.pos_sync_order_tracking(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_printed timestamptz;
  v_max int;
BEGIN
  SELECT * INTO o FROM pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF o.state = 'cancelled' OR o.cancelled_at IS NOT NULL THEN
    UPDATE pos_order_tracking
      SET is_cancelled = true,
          delivered_at = COALESCE(delivered_at, now()),
          is_late = false
      WHERE order_id = _order_id AND delivered_at IS NULL;
    RETURN;
  END IF;

  v_printed := COALESCE(o.receipt_last_print_at, o.paid_at, o.created_at);

  INSERT INTO pos_order_tracking (
    order_id, user_id, company_id, branch_id, business_date,
    order_number, display_number, order_type, printed_at, target_minutes
  ) VALUES (
    o.id, o.user_id, o.company_id, o.branch_id, COALESCE(o.business_date, (v_printed AT TIME ZONE 'Asia/Jerusalem')::date),
    o.order_number, COALESCE(o.daily_display_number::text, o.queue_number::text, o.display_number), o.order_type, v_printed, 8
  )
  ON CONFLICT (order_id) DO NOTHING;

  INSERT INTO pos_order_item_tracking (
    order_line_id, order_id, user_id, company_id, branch_id, business_date,
    product_id, product_name, qty, printed_at, target_minutes
  )
  SELECT l.id, o.id, o.user_id, o.company_id, o.branch_id,
         COALESCE(o.business_date, (v_printed AT TIME ZONE 'Asia/Jerusalem')::date),
         l.product_id, l.product_name, l.qty, v_printed,
         pos_resolve_target_minutes(o.user_id, l.product_id)
  FROM pos_order_lines l
  WHERE l.order_id = o.id
  ON CONFLICT (order_line_id) DO NOTHING;

  SELECT COALESCE(MAX(target_minutes), 8) INTO v_max
    FROM pos_order_item_tracking WHERE order_id = o.id;
  UPDATE pos_order_tracking SET target_minutes = v_max WHERE order_id = o.id AND delivered_at IS NULL;
END;
$function$;

UPDATE pos_order_tracking t
SET display_number = COALESCE(o.daily_display_number::text, o.queue_number::text, t.display_number)
FROM pos_orders o
WHERE o.id = t.order_id
  AND t.printed_at > now() - interval '3 days'
  AND COALESCE(o.daily_display_number::text, o.queue_number::text) IS NOT NULL
  AND t.display_number IS DISTINCT FROM COALESCE(o.daily_display_number::text, o.queue_number::text);