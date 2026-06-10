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
  _ticket_id uuid;
  _branch_id uuid;
  _recalled boolean := false;
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

  SELECT po.id, po.order_number, po.daily_display_number, t.branch_id
    INTO _order_id, _order_no, _disp_no, _branch_id
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

  -- Try to mark non-terminal tickets ready (first call path)
  UPDATE public.kitchen_tickets
     SET status      = 'ready',
         accepted_at = COALESCE(accepted_at, now()),
         ready_at    = COALESCE(ready_at, now()),
         updated_at  = now()
   WHERE order_id = _order_id
     AND status IN ('pending','preparing');
  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- If nothing changed, order is already ready → emit a manual recall event
  -- so the customer display announces the number again.
  IF _updated = 0 THEN
    SELECT id INTO _ticket_id
      FROM public.kitchen_tickets
     WHERE order_id = _order_id
     ORDER BY created_at ASC
     LIMIT 1;

    IF _ticket_id IS NOT NULL THEN
      INSERT INTO public.kds_call_events
        (ticket_id, company_id, branch_id, order_id, display_number, event_type)
      VALUES
        (_ticket_id, _device.company_id, COALESCE(_branch_id, _device.branch_id),
         _order_id, COALESCE(NULLIF(_disp_no::text,''), _order_no), 'recall');

      UPDATE public.kitchen_tickets
         SET last_called_at = now(),
             call_count = COALESCE(call_count,0) + 1,
             updated_at = now()
       WHERE order_id = _order_id;

      _recalled := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', _order_id,
    'order_number', _order_no,
    'display_number', _disp_no,
    'tickets_updated', _updated,
    'recalled', _recalled
  );
END;
$function$;