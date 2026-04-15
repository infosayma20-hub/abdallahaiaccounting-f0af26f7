
-- 1. Update invoice cancel trigger to use create_reverse_entry
CREATE OR REPLACE FUNCTION public.cascade_invoice_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  -- When invoice is cancelled → create reverse entry
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      -- Check if transaction exists and not already deleted/reversed
      IF EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE id = NEW.linked_transaction_id AND is_deleted = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء فاتورة ' || COALESCE(NEW.invoice_number, NEW.id::text)
        ) INTO v_reverse_id;
      END IF;
    END IF;
  END IF;

  -- When invoice is restored from cancelled → reverse the reversal
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      -- Restore original transaction
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;

      -- Soft-delete the reversal entry
      UPDATE public.transactions
      SET is_deleted = true
      WHERE reversed_by_id = NEW.linked_transaction_id
        AND transaction_type = 'reversal'
        AND is_deleted = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Update voucher cancel trigger to use create_reverse_entry
CREATE OR REPLACE FUNCTION public.cascade_voucher_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  -- When voucher is cancelled → create reverse entries
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- By linked_transaction_id
    IF NEW.linked_transaction_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE id = NEW.linked_transaction_id AND is_deleted = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء سند ' || COALESCE(NEW.ref_number, NEW.id::text)
        ) INTO v_reverse_id;
      END IF;
    END IF;

    -- By ref_number (for journal entries with multiple lines)
    IF NEW.ref_number IS NOT NULL THEN
      FOR v_reverse_id IN
        SELECT id FROM public.transactions
        WHERE reference = NEW.ref_number
          AND user_id = NEW.user_id
          AND is_deleted = false
          AND (NEW.linked_transaction_id IS NULL OR id != NEW.linked_transaction_id)
      LOOP
        PERFORM public.create_reverse_entry(
          v_reverse_id,
          'إلغاء سند ' || NEW.ref_number
        );
      END LOOP;
    END IF;
  END IF;

  -- When voucher is restored → reverse the reversals
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      -- Restore original
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id AND is_deleted = true;
      -- Delete reversal
      UPDATE public.transactions
      SET is_deleted = true
      WHERE reversed_by_id = NEW.linked_transaction_id
        AND transaction_type = 'reversal' AND is_deleted = false;
    END IF;

    IF NEW.ref_number IS NOT NULL THEN
      -- Restore originals by reference
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE reference = NEW.ref_number
        AND user_id = NEW.user_id
        AND is_deleted = true
        AND transaction_type != 'reversal';
      -- Delete reversals by reference
      UPDATE public.transactions
      SET is_deleted = true
      WHERE reference LIKE 'REV-' || NEW.ref_number || '%'
        AND user_id = NEW.user_id
        AND transaction_type = 'reversal'
        AND is_deleted = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Update receipt voucher cancel trigger to use create_reverse_entry
CREATE OR REPLACE FUNCTION public.cascade_receipt_voucher_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  -- When receipt is cancelled → create reverse entry
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE id = NEW.linked_transaction_id AND is_deleted = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء سند قبض ' || COALESCE(NEW.receipt_number, NEW.id::text)
        ) INTO v_reverse_id;
      END IF;
    END IF;
  END IF;

  -- When receipt is restored → reverse the reversal
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id AND is_deleted = true;

      UPDATE public.transactions
      SET is_deleted = true
      WHERE reversed_by_id = NEW.linked_transaction_id
        AND transaction_type = 'reversal' AND is_deleted = false;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
