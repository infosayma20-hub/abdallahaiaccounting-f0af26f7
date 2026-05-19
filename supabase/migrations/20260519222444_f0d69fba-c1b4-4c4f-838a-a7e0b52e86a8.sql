CREATE OR REPLACE FUNCTION public.trg_kitchen_tickets_order_ready()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total INTEGER;
  v_ready INTEGER;
  v_order public.pos_orders%ROWTYPE;
  v_display TEXT;
  v_company UUID;
BEGIN
  IF NEW.status NOT IN ('ready') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT COUNT(*) FILTER (WHERE status IN ('pending','preparing','ready')),
         COUNT(*) FILTER (WHERE status = 'ready')
    INTO v_total, v_ready
  FROM public.kitchen_tickets
  WHERE order_id = NEW.order_id;

  IF v_total = 0 OR v_ready < v_total THEN RETURN NEW; END IF;

  SELECT * INTO v_order FROM public.pos_orders WHERE id = NEW.order_id;
  IF v_order.kds_auto_called_at IS NOT NULL THEN RETURN NEW; END IF;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);
  v_company := COALESCE(NEW.company_id, NEW.user_id, v_order.company_id, v_order.user_id);

  BEGIN
    INSERT INTO public.kds_call_events(
      ticket_id, order_id, company_id, branch_id,
      display_number, event_type
    ) VALUES (
      NEW.id, NEW.order_id, v_company, NEW.branch_id,
      v_display, 'auto_call'
    );
    UPDATE public.pos_orders
       SET kds_auto_called_at = now()
     WHERE id = NEW.order_id;
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.kds_recall_order(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_owner UUID;
  v_branch UUID;
  v_display TEXT;
  v_ticket public.kitchen_tickets%ROWTYPE;
  v_company UUID;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL OR v_owner <> v_order.user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT t.branch_id INTO v_branch
  FROM public.pos_sessions s
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE s.id = v_order.session_id;

  v_display := COALESCE(NULLIF(v_order.daily_display_number::text,''), v_order.order_number);

  SELECT * INTO v_ticket FROM public.kitchen_tickets
    WHERE order_id = _order_id ORDER BY created_at DESC LIMIT 1;

  IF v_ticket.id IS NULL THEN RETURN; END IF;

  v_company := COALESCE(v_ticket.company_id, v_ticket.user_id, v_order.company_id, v_order.user_id);

  INSERT INTO public.kds_call_events(
    ticket_id, order_id, company_id, branch_id,
    display_number, event_type, created_by
  ) VALUES (
    v_ticket.id, _order_id, v_company, COALESCE(v_branch, v_ticket.branch_id),
    v_display, 'recall', auth.uid()
  );

  UPDATE public.kitchen_tickets
     SET last_called_at = now(),
         call_count = call_count + 1
   WHERE order_id = _order_id;
END;
$function$;