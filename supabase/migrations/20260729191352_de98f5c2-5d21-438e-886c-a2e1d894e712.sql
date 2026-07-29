CREATE OR REPLACE FUNCTION public.tg_pos_post_ils_change_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order       record;
  v_ils_gl      text;
  v_foreign_gl  text;
  v_change      numeric;
  v_key         text;
BEGIN
  v_change := COALESCE(NEW.change_amount, 0);

  -- Only: cash tender, in a foreign currency, with change handed back in ILS.
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

  -- ILS drawer GL for this shift (same resolution complete_pos_order uses).
  IF v_order.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_ils_gl FROM public.cash_boxes WHERE id = v_order.cash_box_id;
  END IF;
  IF v_ils_gl IS NULL AND v_order.terminal_id IS NOT NULL THEN
    SELECT cash_account_code INTO v_ils_gl FROM public.pos_terminals WHERE id = v_order.terminal_id;
  END IF;
  v_ils_gl := COALESCE(v_ils_gl, '1110');

  v_foreign_gl := public._pos_resolve_cash_gl(v_order.cash_box_id, NEW.currency, v_ils_gl);

  -- No foreign drawer configured → nothing meaningful to move.
  IF v_foreign_gl IS NULL OR v_foreign_gl = v_ils_gl THEN RETURN NEW; END IF;

  v_key := 'poschg-' || NEW.id::text;

  IF EXISTS (SELECT 1 FROM public.transactions WHERE idempotency_key = v_key) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key, pos_order_id
  ) VALUES (
    v_order.user_id, CURRENT_DATE,
    'باقي نقدي بالشيكل عن دفعة ' || upper(NEW.currency) || ' - POS ' || COALESCE(v_order.order_number, ''),
    v_foreign_gl, v_ils_gl,
    ROUND(v_change, 2), 'شيكل', 'pos_change_out', v_order.customer_id,
    v_order.order_number, 'cash', v_key, v_order.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a sale because of a reconciliation side-entry.
  RAISE WARNING 'pos_change_out failed for payment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_post_ils_change_out ON public.pos_payments;
CREATE TRIGGER trg_pos_post_ils_change_out
AFTER INSERT ON public.pos_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_pos_post_ils_change_out();