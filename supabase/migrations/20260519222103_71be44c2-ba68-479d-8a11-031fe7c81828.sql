-- 1) Status update: compare ticket.user_id with device.company_id (owner)
CREATE OR REPLACE FUNCTION public.kds_update_ticket_status(_token text, _ticket_id uuid, _status text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _ticket public.kitchen_tickets%ROWTYPE;
BEGIN
  IF _status NOT IN ('pending','preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
  IF _device.device_type NOT IN ('kitchen_screen','heater_screen') THEN
    RAISE EXCEPTION 'Device not authorized';
  END IF;

  SELECT * INTO _ticket FROM public.kitchen_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

  IF _ticket.user_id <> _device.company_id THEN
    RAISE EXCEPTION 'Cross-company forbidden';
  END IF;
  IF _device.branch_id IS NOT NULL AND _ticket.branch_id IS NOT NULL
     AND _ticket.branch_id <> _device.branch_id THEN
    RAISE EXCEPTION 'Cross-branch forbidden';
  END IF;

  UPDATE public.kitchen_tickets SET status = _status WHERE id = _ticket_id;
  RETURN true;
END;
$function$;

-- 2) Recall by token: pos_orders has no branch_id; drop that check
CREATE OR REPLACE FUNCTION public.kds_recall_order_by_token(_token text, _order_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _device public.pos_display_devices%ROWTYPE;
  _order public.pos_orders%ROWTYPE;
BEGIN
  SELECT * INTO _device FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
  IF _device.device_type NOT IN ('kitchen_screen','heater_screen','customer_display') THEN
    RAISE EXCEPTION 'Device not authorized';
  END IF;

  SELECT * INTO _order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _order.user_id <> _device.company_id THEN
    RAISE EXCEPTION 'Cross-company forbidden';
  END IF;

  PERFORM public.kds_recall_order(_order_id);
  RETURN true;
END;
$function$;

-- 3) Recent call events: correlate via ticket → kitchen_tickets.user_id
CREATE OR REPLACE FUNCTION public.kds_recent_call_events(_token text, _since timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS TABLE(id uuid, order_id uuid, display_number text, event_type text, created_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _d public.pos_display_devices%ROWTYPE;
BEGIN
  SELECT * INTO _d FROM public.pos_display_devices
   WHERE token = _token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT e.id, e.order_id,
         COALESCE(NULLIF(po.daily_display_number::text,''), po.order_number, e.display_number) AS display_number,
         e.event_type, e.created_at
  FROM public.kds_call_events e
  LEFT JOIN public.kitchen_tickets kt ON kt.id = e.ticket_id
  LEFT JOIN public.pos_orders po ON po.id = e.order_id
  WHERE COALESCE(kt.user_id, po.user_id) = _d.company_id
    AND (_d.branch_id IS NULL OR e.branch_id IS NULL OR e.branch_id = _d.branch_id)
    AND (_since IS NULL OR e.created_at > _since)
    AND e.created_at > now() - interval '1 hour'
  ORDER BY e.created_at ASC;
END;
$function$;

-- 4) Diagnostic
CREATE OR REPLACE FUNCTION public.kds_debug_device(_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _d public.pos_display_devices%ROWTYPE; _r jsonb;
BEGIN
  SELECT * INTO _d FROM public.pos_display_devices WHERE token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','token_not_found'); END IF;

  SELECT jsonb_build_object(
    'device_id', _d.id,
    'device_type', _d.device_type,
    'device_company_id', _d.company_id,
    'device_branch_id', _d.branch_id,
    'tickets_by_user', (SELECT count(*) FROM public.kitchen_tickets kt WHERE kt.user_id = _d.company_id),
    'orders_by_user', (SELECT count(*) FROM public.pos_orders po WHERE po.user_id = _d.company_id),
    'sample', (
      SELECT jsonb_agg(jsonb_build_object(
        'order_id', kt.order_id,
        'order_number', po.order_number,
        'daily_display_number', po.daily_display_number,
        'ticket_status', kt.status,
        'kt_user_id', kt.user_id,
        'kt_company_id', kt.company_id,
        'kt_branch_id', kt.branch_id
      ) ORDER BY kt.created_at DESC)
      FROM (
        SELECT * FROM public.kitchen_tickets WHERE user_id = _d.company_id
        ORDER BY created_at DESC LIMIT 10
      ) kt
      LEFT JOIN public.pos_orders po ON po.id = kt.order_id
    )
  ) INTO _r;

  RETURN _r;
END;
$function$;