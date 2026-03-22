
-- Unified cascade trigger: when a transaction is soft-deleted, cascade to ALL linked documents
-- and vice versa, when a document is cancelled, cascade to linked transaction

CREATE OR REPLACE FUNCTION public.cascade_transaction_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When transaction is soft-deleted
  IF NEW.is_deleted = true AND (OLD.is_deleted = false OR OLD.is_deleted IS NULL) THEN
    -- Cancel linked receipt vouchers
    UPDATE public.receipt_vouchers
    SET status = 'cancelled'
    WHERE linked_transaction_id = NEW.id
      AND status != 'cancelled';

    -- Cancel linked payment/journal vouchers
    UPDATE public.vouchers
    SET status = 'cancelled'
    WHERE linked_transaction_id = NEW.id
      AND status != 'cancelled';

    -- Cancel linked sales invoices
    UPDATE public.invoices
    SET status = 'cancelled'
    WHERE linked_transaction_id = NEW.id
      AND status != 'cancelled';

    -- Cancel linked purchase invoices
    UPDATE public.purchase_invoices
    SET status = 'cancelled'
    WHERE linked_transaction_id = NEW.id
      AND status != 'cancelled';
  END IF;

  -- When transaction is restored (un-deleted)
  IF NEW.is_deleted = false AND OLD.is_deleted = true THEN
    -- Restore linked receipt vouchers
    UPDATE public.receipt_vouchers
    SET status = 'posted'
    WHERE linked_transaction_id = NEW.id
      AND status = 'cancelled';

    -- Restore linked payment/journal vouchers
    UPDATE public.vouchers
    SET status = 'posted'
    WHERE linked_transaction_id = NEW.id
      AND status = 'cancelled';

    -- Restore linked sales invoices
    UPDATE public.invoices
    SET status = 'posted'
    WHERE linked_transaction_id = NEW.id
      AND status = 'cancelled';

    -- Restore linked purchase invoices
    UPDATE public.purchase_invoices
    SET status = 'posted'
    WHERE linked_transaction_id = NEW.id
      AND status = 'cancelled';
  END IF;

  RETURN NEW;
END;
$$;

-- Also handle the reverse: match by ref_number for journal vouchers
CREATE OR REPLACE FUNCTION public.cascade_voucher_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When voucher is cancelled, soft-delete linked transactions
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- By linked_transaction_id
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = false;
    END IF;

    -- By ref_number (for journal entries)
    IF NEW.ref_number IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE reference = NEW.ref_number
        AND user_id = NEW.user_id
        AND is_deleted = false;
    END IF;
  END IF;

  -- When voucher is restored, restore linked transactions
  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;
    END IF;

    IF NEW.ref_number IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false
      WHERE reference = NEW.ref_number
        AND user_id = NEW.user_id
        AND is_deleted = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Same for receipt_vouchers
CREATE OR REPLACE FUNCTION public.cascade_receipt_voucher_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = false;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Same for invoices
CREATE OR REPLACE FUNCTION public.cascade_invoice_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = false;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Same for purchase_invoices
CREATE OR REPLACE FUNCTION public.cascade_purchase_invoice_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = false;
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create all triggers
CREATE TRIGGER trg_cascade_transaction_soft_delete
  AFTER UPDATE OF is_deleted ON public.transactions
  FOR EACH ROW
  WHEN (OLD.is_deleted IS DISTINCT FROM NEW.is_deleted)
  EXECUTE FUNCTION public.cascade_transaction_soft_delete();

CREATE TRIGGER trg_cascade_voucher_cancel
  AFTER UPDATE OF status ON public.vouchers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cascade_voucher_cancel_to_transactions();

CREATE TRIGGER trg_cascade_receipt_voucher_cancel
  AFTER UPDATE OF status ON public.receipt_vouchers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cascade_receipt_voucher_cancel_to_transactions();

CREATE TRIGGER trg_cascade_invoice_cancel
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cascade_invoice_cancel_to_transactions();

CREATE TRIGGER trg_cascade_purchase_invoice_cancel
  AFTER UPDATE OF status ON public.purchase_invoices
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.cascade_purchase_invoice_cancel_to_transactions();
