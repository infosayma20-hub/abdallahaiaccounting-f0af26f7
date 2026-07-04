
CREATE OR REPLACE FUNCTION public.cancel_bulk_voucher(
  p_voucher_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_ref text;
  v_status text;
  v_tx record;
  v_link record;
  v_inv record;
  v_new_paid numeric;
BEGIN
  SELECT user_id, ref_number, status
    INTO v_owner, v_ref, v_status
  FROM public.vouchers
  WHERE id = p_voucher_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  FOR v_tx IN
    SELECT id FROM public.transactions
    WHERE user_id = v_owner
      AND (reference = v_ref OR idempotency_key LIKE 'BULK-' || v_ref || '-%')
      AND COALESCE(is_deleted, false) = false
  LOOP
    FOR v_link IN
      SELECT id, invoice_id, allocated_amount
      FROM public.payment_invoice_links
      WHERE transaction_id = v_tx.id OR payment_id = v_tx.id
    LOOP
      SELECT id, paid_amount, total_amount INTO v_inv
      FROM public.invoices WHERE id = v_link.invoice_id;
      IF FOUND THEN
        v_new_paid := GREATEST(0, COALESCE(v_inv.paid_amount, 0) - COALESCE(v_link.allocated_amount, 0));
        UPDATE public.invoices
          SET paid_amount = v_new_paid,
              remaining_amount = COALESCE(total_amount, 0) - v_new_paid,
              payment_status = CASE
                WHEN v_new_paid <= 0 THEN 'unpaid'
                WHEN v_new_paid < COALESCE(total_amount, 0) THEN 'partial'
                ELSE 'paid'
              END
          WHERE id = v_link.invoice_id;
      END IF;
      DELETE FROM public.payment_invoice_links WHERE id = v_link.id;
    END LOOP;
  END LOOP;

  UPDATE public.transactions
    SET is_deleted = true,
        idempotency_key = NULL
  WHERE user_id = v_owner
    AND (reference = v_ref OR idempotency_key LIKE 'BULK-' || v_ref || '-%')
    AND COALESCE(is_deleted, false) = false;

  UPDATE public.vouchers
    SET status = 'cancelled',
        notes = COALESCE(notes, '') ||
                CASE WHEN p_reason IS NOT NULL AND p_reason <> ''
                     THEN E'\n[Cancelled] ' || p_reason
                     ELSE E'\n[Cancelled]' END
  WHERE id = p_voucher_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_bulk_voucher(uuid, text) TO authenticated;
