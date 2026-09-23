CREATE OR REPLACE FUNCTION public.tg_pos_post_ils_change_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order       record;
  v_ils_gl      text;
  v_foreign_gl  text;
  v_change      numeric;
  v_key         text;
  v_rate        numeric;
  v_label       text;
  v_fx          numeric;
BEGIN
  v_change := COALESCE(NEW.change_amount, 0);

  IF COALESCE(NEW.payment_method, 'cash') <> 'cash'
     OR upper(COALESCE(NEW.currency, 'ILS')) = 'ILS'
     OR upper(COALESCE(NEW.change_currency, 'ILS')) <> 'ILS'
     OR v_change <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT o.id, o.user_id, o.order_number, o.customer_id, o.session_id,
         s.cash_box_id, s.terminal_id
    INTO v_order
    FROM public.pos_orders o
    LEFT JOIN public.pos_sessions s ON s.id = o.session_id
   WHERE o.id = NEW.order_id;

  IF v_order.id IS NULL THEN RETURN NEW; END IF;

  IF v_order.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_ils_gl FROM public.cash_boxes WHERE id = v_order.cash_box_id;
  END IF;
  IF v_ils_gl IS NULL AND v_order.terminal_id IS NOT NULL THEN
    SELECT cash_account_code INTO v_ils_gl FROM public.pos_terminals WHERE id = v_order.terminal_id;
  END IF;
  v_ils_gl := COALESCE(v_ils_gl, '1110');

  v_foreign_gl := public._pos_resolve_cash_gl(v_order.cash_box_id, NEW.currency, v_ils_gl);
  IF v_foreign_gl IS NULL OR v_foreign_gl = v_ils_gl THEN RETURN NEW; END IF;

  v_key := 'poschg-' || NEW.id::text;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE idempotency_key = v_key) THEN
    RETURN NEW;
  END IF;

  -- The foreign drawer physically kept the change-equivalent in its own
  -- currency, so the entry must carry the native amount too (same labels
  -- and rate convention as complete_pos_order's pos_sale lines).
  v_rate := NULLIF(NEW.exchange_rate, 0);
  v_label := CASE upper(NEW.currency)
      WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو'
      WHEN 'EGP' THEN 'جنيه' ELSE upper(NEW.currency) END;
  v_fx := CASE WHEN v_rate IS NULL THEN NULL ELSE ROUND(v_change / v_rate, 2) END;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, foreign_amount, exchange_rate,
    transaction_type, contact_id,
    reference, payment_method, idempotency_key, pos_order_id
  ) VALUES (
    v_order.user_id, CURRENT_DATE,
    'باقي نقدي بالشيكل عن دفعة ' || upper(NEW.currency) || ' - POS ' || COALESCE(v_order.order_number, ''),
    v_foreign_gl, v_ils_gl,
    ROUND(v_change, 2),
    CASE WHEN v_fx IS NULL THEN 'شيكل' ELSE v_label END,
    v_fx, v_rate,
    'pos_change_out', v_order.customer_id,
    v_order.order_number, 'cash', v_key, v_order.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pos_change_out failed for payment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;