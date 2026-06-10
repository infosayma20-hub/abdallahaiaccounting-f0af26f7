
CREATE OR REPLACE FUNCTION public.kds_mark_order_ready_by_number(_token text, _display_number integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _order  public.pos_orders%ROWTYPE;
  _updated integer := 0;
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

  -- Find today's order with that display number, scoped to the device's company and branch
  SELECT o.* INTO _order
    FROM public.pos_orders o
   WHERE o.company_id = _device.company_id
     AND (_device.branch_id IS NULL OR o.branch_id = _device.branch_id)
     AND o.daily_display_number = _display_number
     AND o.business_date = _biz_date
     AND COALESCE(o.is_return, false) = false
     AND o.state NOT IN ('cancelled','draft_cancelled')
   ORDER BY o.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لم يتم العثور على طلب برقم % لهذا الفرع اليوم', _display_number;
  END IF;

  -- Mark all non-terminal tickets for this order as ready
  UPDATE public.kitchen_tickets
     SET status      = 'ready',
         accepted_at = COALESCE(accepted_at, now()),
         ready_at    = COALESCE(ready_at, now()),
         updated_at  = now()
   WHERE order_id = _order.id
     AND status IN ('pending','preparing');
  GET DIAGNOSTICS _updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', _order.id,
    'order_number', _order.order_number,
    'display_number', _order.daily_display_number,
    'tickets_updated', _updated
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kds_mark_order_ready_by_number(text, integer) TO anon, authenticated;
