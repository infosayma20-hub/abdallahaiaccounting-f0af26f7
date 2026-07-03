-- Fix payment voucher edit/cancel cascade safety.
-- Root cause: the old frontend edit flow soft-deleted the currently linked
-- transaction before relinking the voucher. trg_cascade_transaction_soft_delete
-- then marked the payment voucher as cancelled although a new active journal
-- transaction was created immediately afterwards. Also, the generic restore
-- branch swept all transactions by ref_number, which could resurrect old
-- deleted edit-history rows for payment vouchers.

CREATE OR REPLACE FUNCTION public.cascade_voucher_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_reverse_id uuid;
  v_label text;
BEGIN
  v_label := CASE
    WHEN NEW.type = 'payment' THEN 'سند صرف '
    WHEN NEW.type = 'receipt' THEN 'سند قبض '
    WHEN NEW.type = 'journal' THEN 'سند قيد '
    ELSE 'سند '
  END;

  -- When a voucher is cancelled, create visible reversal entries.
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      FOR v_tx IN
        SELECT t.id
        FROM public.transactions t
        WHERE t.id = NEW.linked_transaction_id
          AND t.user_id = NEW.user_id
          AND COALESCE(t.is_deleted, false) = false
          AND t.transaction_type <> 'reversal'
          AND NOT EXISTS (
            SELECT 1
            FROM public.transactions r
            WHERE r.user_id = t.user_id
              AND r.transaction_type = 'reversal'
              AND COALESCE(r.is_deleted, false) = false
              AND r.reversed_by_id = t.id
          )
      LOOP
        SELECT public.create_reverse_entry(
          v_tx.id,
          'إلغاء ' || v_label || COALESCE(NEW.ref_number, NEW.id::text),
          NEW.user_id
        ) INTO v_reverse_id;
      END LOOP;
    END IF;

    -- Only journal vouchers may intentionally have multiple transaction rows
    -- under the same reference. Payment vouchers must not sweep by ref_number
    -- because old edited rows keep the same reference and are already deleted.
    IF NEW.type = 'journal' AND NEW.ref_number IS NOT NULL THEN
      FOR v_tx IN
        SELECT t.id
        FROM public.transactions t
        WHERE t.reference = NEW.ref_number
          AND t.user_id = NEW.user_id
          AND COALESCE(t.is_deleted, false) = false
          AND t.transaction_type <> 'reversal'
          AND (NEW.linked_transaction_id IS NULL OR t.id <> NEW.linked_transaction_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.transactions r
            WHERE r.user_id = t.user_id
              AND r.transaction_type = 'reversal'
              AND COALESCE(r.is_deleted, false) = false
              AND r.reversed_by_id = t.id
          )
      LOOP
        SELECT public.create_reverse_entry(
          v_tx.id,
          'إلغاء ' || v_label || NEW.ref_number,
          NEW.user_id
        ) INTO v_reverse_id;
      END LOOP;
    END IF;
  END IF;

  -- When a voucher is restored from cancelled, remove only its cancellation
  -- reversals. For payment vouchers, do NOT restore every deleted row by
  -- ref_number; that would duplicate edited payment vouchers.
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
         SET is_deleted = false,
             reversed_by_id = NULL,
             updated_at = now()
       WHERE id = NEW.linked_transaction_id
         AND user_id = NEW.user_id
         AND COALESCE(is_deleted, false) = true;

      UPDATE public.transactions
         SET is_deleted = true,
             updated_at = now()
       WHERE user_id = NEW.user_id
         AND transaction_type = 'reversal'
         AND COALESCE(is_deleted, false) = false
         AND reversed_by_id = NEW.linked_transaction_id;

      UPDATE public.transactions
         SET reversed_by_id = NULL,
             updated_at = now()
       WHERE id = NEW.linked_transaction_id
         AND user_id = NEW.user_id;
    END IF;

    IF NEW.type = 'journal' AND NEW.ref_number IS NOT NULL THEN
      FOR v_tx IN
        SELECT t.id
        FROM public.transactions t
        WHERE t.reference = NEW.ref_number
          AND t.user_id = NEW.user_id
          AND t.transaction_type <> 'reversal'
      LOOP
        UPDATE public.transactions
           SET is_deleted = true,
               updated_at = now()
         WHERE user_id = NEW.user_id
           AND transaction_type = 'reversal'
           AND COALESCE(is_deleted, false) = false
           AND reversed_by_id = v_tx.id;

        UPDATE public.transactions
           SET is_deleted = false,
               reversed_by_id = NULL,
               updated_at = now()
         WHERE id = v_tx.id
           AND user_id = NEW.user_id;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DO $repair_pv_2026_0009$
DECLARE
  v_owner uuid := '3358a87e-0a2e-4ad1-88c0-1e9ff8fda482'::uuid;
  v_ref text := 'PV-2026-0009';
  v_voucher public.vouchers%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_tx_found boolean := false;
  v_active_reversals int;
BEGIN
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE user_id = v_owner
    AND type = 'payment'
    AND ref_number = v_ref
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = v_voucher.linked_transaction_id
      AND user_id = v_owner;
    v_tx_found := FOUND;

    SELECT COUNT(*) INTO v_active_reversals
    FROM public.transactions r
    WHERE r.user_id = v_owner
      AND r.transaction_type = 'reversal'
      AND COALESCE(r.is_deleted, false) = false
      AND r.reversed_by_id = v_voucher.linked_transaction_id;

    IF v_voucher.status = 'cancelled'
       AND v_tx_found
       AND COALESCE(v_tx.is_deleted, false) = false
       AND v_active_reversals = 0
       AND v_tx.debit_account_code = '5930'
       AND v_tx.credit_account_code = '11101'
       AND v_tx.amount = 800
    THEN
      INSERT INTO public.finance_integrity_fix_log
        (fix_batch, entity_type, entity_id, old_value, new_value, reason)
      VALUES
        ('payment_voucher_edit_cascade_fix_20260703', 'payment_voucher', v_voucher.id,
         jsonb_build_object(
           'ref_number', v_voucher.ref_number,
           'status', v_voucher.status,
           'linked_transaction_id', v_voucher.linked_transaction_id,
           'transaction_active', NOT COALESCE(v_tx.is_deleted, false),
           'active_reversals', v_active_reversals
         ),
         jsonb_build_object('status', 'posted', 'linked_transaction_id', v_voucher.linked_transaction_id),
         'Restore PV-2026-0009: voucher was marked cancelled by edit-time transaction soft-delete, while its replacement journal entry is active and unreversed.'
        );

      UPDATE public.vouchers
         SET status = 'posted',
             posted_at = COALESCE(posted_at, updated_at, now()),
             updated_at = now()
       WHERE id = v_voucher.id
         AND user_id = v_owner;
    END IF;
  END IF;
END;
$repair_pv_2026_0009$;

COMMENT ON FUNCTION public.cascade_voucher_cancel_to_transactions() IS
'Safe cancellation/restoration for vouchers. Payment vouchers use linked_transaction_id only; journal vouchers may sweep by ref_number. Prevents edited payment voucher history rows from being restored accidentally.';
