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
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(total, 0)
    INTO v_total
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

  UPDATE public.orders
  SET paid_amount = v_paid,
      remaining_amount = GREATEST(0, v_total - v_paid),
      payment_status = v_payment_status
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_order_payment_from_transactions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_order_payment_from_transactions(uuid) TO service_role;