CREATE OR REPLACE FUNCTION public.recompute_order_payment_from_transactions(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_paid numeric;
  v_payment_status text;
  v_current_status text;
  v_new_status text;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(total, 0), status
    INTO v_total, v_current_status
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
  FROM public.transactions
  WHERE order_id = p_order_id
    AND transaction_type = 'receipt'
    AND COALESCE(is_deleted, false) = false;

  v_paid := LEAST(v_total, GREATEST(0, v_paid));
  v_payment_status := CASE
    WHEN v_paid <= 0 THEN 'غير مدفوع'
    WHEN v_paid + 0.001 >= v_total THEN 'مدفوع'
    ELSE 'مدفوع جزئياً'
  END;

  v_new_status := CASE
    WHEN v_current_status = 'ملغي' THEN v_current_status
    WHEN v_paid + 0.001 >= v_total AND v_total > 0 THEN 'مدفوع كاملاً'
    WHEN v_paid > 0 THEN 'مدفوع جزئياً'
    WHEN v_current_status IN ('مدفوع كاملاً', 'مدفوع جزئياً') THEN 'جديد'
    ELSE v_current_status
  END;

  UPDATE public.orders
  SET paid_amount = v_paid,
      remaining_amount = GREATEST(0, v_total - v_paid),
      payment_status = v_payment_status,
      status = v_new_status
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_order_payment_from_transactions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_order_payment_from_transactions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_order_payment_on_transaction_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_payment_from_transactions(OLD.order_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
    PERFORM public.recompute_order_payment_from_transactions(OLD.order_id);
  END IF;

  PERFORM public.recompute_order_payment_from_transactions(NEW.order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_payment_on_transaction_change ON public.transactions;
CREATE TRIGGER trg_sync_order_payment_on_transaction_change
AFTER INSERT OR UPDATE OF order_id, amount, transaction_type, is_deleted OR DELETE
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_on_transaction_change();

CREATE OR REPLACE FUNCTION public.cancel_linked_receipt_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.linked_transaction_id IS NOT NULL THEN
    UPDATE public.transactions
    SET is_deleted = true,
        idempotency_key = NULL
    WHERE id = NEW.linked_transaction_id
      AND COALESCE(is_deleted, false) = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_linked_receipt_transaction ON public.receipt_vouchers;
CREATE TRIGGER trg_cancel_linked_receipt_transaction
AFTER UPDATE OF status ON public.receipt_vouchers
FOR EACH ROW
EXECUTE FUNCTION public.cancel_linked_receipt_transaction();