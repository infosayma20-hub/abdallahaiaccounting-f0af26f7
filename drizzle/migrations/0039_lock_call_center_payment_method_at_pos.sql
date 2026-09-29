-- The branch cashier must settle a call-center order with exactly the method the agent chose.
-- Enforced on the original tender only (INSERT). Manager-approved post-payment edits (UPDATE) are untouched.
CREATE OR REPLACE FUNCTION public.guard_pos_payment_matches_call_center()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_cc record;
  v_customer uuid;
  v_expected text;
BEGIN
  IF COALESCE(NEW.is_refund, false) THEN RETURN NEW; END IF;

  SELECT payment_method, customer_contact_id INTO v_cc
  FROM public.call_center_orders
  WHERE pos_order_id = NEW.order_id
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND OR v_cc.payment_method IS NULL THEN RETURN NEW; END IF;

  v_expected := CASE v_cc.payment_method WHEN 'visa' THEN 'card' ELSE v_cc.payment_method END;

  IF NEW.payment_method IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'طريقة الدفع محددة من الكول سنتر (%) ولا يمكن تغييرها من الكاشير',
      CASE v_cc.payment_method WHEN 'cash' THEN 'نقد' WHEN 'visa' THEN 'فيزا' ELSE 'آجل' END;
  END IF;

  IF v_cc.payment_method = 'credit' THEN
    SELECT customer_id INTO v_customer FROM public.pos_orders WHERE id = NEW.order_id;
    IF v_customer IS DISTINCT FROM v_cc.customer_contact_id THEN
      RAISE EXCEPTION 'طلب آجل من الكول سنتر يجب أن يُسجَّل على نفس الزبون المحدد';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pos_payment_matches_cc ON public.pos_payments;
CREATE TRIGGER trg_guard_pos_payment_matches_cc
  BEFORE INSERT ON public.pos_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_pos_payment_matches_call_center();