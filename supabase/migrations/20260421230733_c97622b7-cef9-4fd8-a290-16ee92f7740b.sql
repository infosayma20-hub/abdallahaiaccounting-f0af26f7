-- Fix cascade trigger functions to pass the owner user_id as the third arg of create_reverse_entry

CREATE OR REPLACE FUNCTION public.cascade_invoice_cancel_to_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE id = NEW.linked_transaction_id AND is_deleted = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء فاتورة ' || COALESCE(NEW.invoice_number, NEW.id::text),
          NEW.user_id
        ) INTO v_reverse_id;
      END IF;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;

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

CREATE OR REPLACE FUNCTION public.cascade_receipt_voucher_cancel_to_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE id = NEW.linked_transaction_id AND is_deleted = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء سند قبض ' || COALESCE(NEW.receipt_number, NEW.id::text),
          NEW.user_id
        ) INTO v_reverse_id;
      END IF;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;

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

CREATE OR REPLACE FUNCTION public.cascade_payment_voucher_cancel_to_transactions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE id = NEW.linked_transaction_id AND is_deleted = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء سند صرف ' || COALESCE(NEW.voucher_number, NEW.id::text),
          NEW.user_id
        ) INTO v_reverse_id;
      END IF;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;

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