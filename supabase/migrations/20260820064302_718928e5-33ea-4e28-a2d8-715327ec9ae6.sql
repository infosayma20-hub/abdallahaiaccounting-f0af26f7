CREATE OR REPLACE FUNCTION public.cascade_invoice_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reverse_id uuid;
  v_auto_tx    uuid;
  v_has_doc    boolean := false;
  v_n          integer;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    -- (a) reverse linked journal entry
    IF NEW.linked_transaction_id IS NOT NULL THEN
      SELECT COALESCE(t.reversed_by_id, r.id) INTO v_reverse_id
      FROM public.transactions t
      LEFT JOIN public.transactions r
        ON r.reversed_by_id = t.id
       AND COALESCE(r.is_deleted, false) = false
      WHERE t.id = NEW.linked_transaction_id
        AND COALESCE(t.is_deleted, false) = false
      LIMIT 1;

      IF v_reverse_id IS NULL AND EXISTS (
        SELECT 1 FROM public.transactions
        WHERE id = NEW.linked_transaction_id
          AND COALESCE(is_deleted, false) = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء فاتورة ' || COALESCE(NEW.invoice_number, NEW.id::text),
          NEW.user_id
        ) INTO v_reverse_id;
      END IF;
    END IF;

    -- (b) reverse stock movements idempotently
    PERFORM public.reverse_invoice_stock(NEW.id);

    -- (b2) NEW: cancel the AUTO cash voucher created by sync_cash_invoice_voucher
    SELECT id INTO v_auto_tx
    FROM public.transactions
    WHERE user_id = NEW.user_id
      AND idempotency_key = 'INV-VOUCHER-' || NEW.id::text
      AND COALESCE(is_deleted, false) = false
    LIMIT 1;

    IF v_auto_tx IS NOT NULL THEN
      UPDATE public.receipt_vouchers
         SET status = 'cancelled', updated_at = now()
       WHERE user_id = NEW.user_id
         AND linked_transaction_id = v_auto_tx
         AND COALESCE(status, 'posted') <> 'cancelled';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_has_doc := true; END IF;

      UPDATE public.vouchers
         SET status = 'cancelled'
       WHERE user_id = NEW.user_id
         AND linked_transaction_id = v_auto_tx
         AND COALESCE(status, 'posted') <> 'cancelled';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN v_has_doc := true; END IF;

      -- fallback: no voucher document (or already cancelled) → reverse the journal directly
      IF NOT v_has_doc AND NOT EXISTS (
        SELECT 1 FROM public.transactions r
        WHERE r.reversed_by_id = v_auto_tx
          AND r.transaction_type = 'reversal'
          AND COALESCE(r.is_deleted, false) = false
      ) THEN
        PERFORM public.create_reverse_entry(
          v_auto_tx,
          'إلغاء فاتورة ' || COALESCE(NEW.invoice_number, NEW.id::text),
          NEW.user_id
        );
      END IF;

      DELETE FROM public.payment_invoice_links WHERE transaction_id = v_auto_tx;

      UPDATE public.invoices
         SET paid_amount = 0,
             remaining_amount = total_amount,
             payment_status = 'unpaid'
       WHERE id = NEW.id
         AND user_id = NEW.user_id
         AND (COALESCE(paid_amount, 0) <> 0 OR COALESCE(payment_status, '') <> 'unpaid');
    END IF;

    -- (c) sync void flags
    UPDATE public.invoices
       SET is_voided = true,
           voided_at = COALESCE(voided_at, now()),
           void_reason = COALESCE(void_reason, 'إلغاء الفاتورة'),
           notes_internal = COALESCE(notes_internal, '') ||
             CASE WHEN COALESCE(notes_internal, '') ILIKE '%[VOID-SYNC%'
                  THEN ''
                  ELSE E'\n[VOID-SYNC ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] cancellation status normalized'
             END
     WHERE id = NEW.id
       AND (COALESCE(is_voided, false) = false OR voided_at IS NULL);
  END IF;

  -- Un-cancel path
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id AND is_deleted = true;

      UPDATE public.transactions
      SET is_deleted = true
      WHERE reversed_by_id = NEW.linked_transaction_id
        AND transaction_type = 'reversal'
        AND is_deleted = false;
    END IF;

    -- NEW: restore the auto cash voucher (its own trigger restores the journal)
    SELECT id INTO v_auto_tx
    FROM public.transactions
    WHERE user_id = NEW.user_id
      AND idempotency_key = 'INV-VOUCHER-' || NEW.id::text
    LIMIT 1;

    IF v_auto_tx IS NOT NULL THEN
      UPDATE public.receipt_vouchers
         SET status = 'posted', updated_at = now()
       WHERE user_id = NEW.user_id
         AND linked_transaction_id = v_auto_tx
         AND status = 'cancelled';

      UPDATE public.vouchers
         SET status = 'posted'
       WHERE user_id = NEW.user_id
         AND linked_transaction_id = v_auto_tx
         AND status = 'cancelled';
    END IF;

    UPDATE public.invoices
       SET is_voided = false, voided_at = NULL, void_reason = NULL
     WHERE id = NEW.id AND COALESCE(is_voided, false) = true;
  END IF;

  RETURN NEW;
END
$function$;