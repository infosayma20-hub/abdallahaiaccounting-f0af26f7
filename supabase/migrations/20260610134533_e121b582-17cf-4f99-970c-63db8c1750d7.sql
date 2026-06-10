
CREATE OR REPLACE FUNCTION public.kds_mark_order_ready_by_number(_token text, _display_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _device   public.pos_display_devices%ROWTYPE;
  _order_id uuid;
  _order_no text;
  _disp_no  integer;
  _updated  integer := 0;
  _biz_date date;
BEGIN
  IF _display_number IS NULL OR _display_number <= 0 THEN
    RAISE EXCEPTION 'رقم الطلب غير صالح';
  END IF;

  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'توكن غير صالح'; END IF;
  IF _device.device_type NOT IN ('kitchen_screen','heater_screen') THEN
    RAISE EXCEPTION 'الجهاز غير مسموح';
  END IF;

  _biz_date := public.kds_business_date();

  -- Resolve branch via session→terminal (pos_orders has no branch_id column)
  SELECT po.id, po.order_number, po.daily_display_number
    INTO _order_id, _order_no, _disp_no
    FROM public.pos_orders po
    LEFT JOIN public.pos_sessions s ON s.id = po.session_id
    LEFT JOIN public.pos_terminals t ON t.id = s.terminal_id
   WHERE po.company_id = _device.company_id
     AND po.daily_display_number = _display_number
     AND po.business_date = _biz_date
     AND COALESCE(po.is_return, false) = false
     AND po.state NOT IN ('cancelled','draft_cancelled')
     AND (_device.branch_id IS NULL OR t.branch_id = _device.branch_id)
   ORDER BY po.created_at DESC
   LIMIT 1;

  IF _order_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على طلب برقم % لهذا الفرع اليوم', _display_number;
  END IF;

  -- Mark all non-terminal tickets for this order as ready.
  -- The existing trigger trg_kitchen_tickets_order_ready fires when the LAST
  -- station becomes ready and inserts the auto_call event (single-fire via
  -- uniq_kds_auto_call_per_order). The customer display picks it up via
  -- kds_get_active_orders and announces via announcedRef.
  UPDATE public.kitchen_tickets
     SET status      = 'ready',
         accepted_at = COALESCE(accepted_at, now()),
         ready_at    = COALESCE(ready_at, now()),
         updated_at  = now()
   WHERE order_id = _order_id
     AND status IN ('pending','preparing');
  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', _order_id,
    'order_number', _order_no,
    'display_number', _disp_no,
    'tickets_updated', _updated
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kds_mark_order_ready_by_number(text, integer) TO anon, authenticated;
