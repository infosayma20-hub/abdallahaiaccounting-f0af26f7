
-- Trigger: when a transaction with type 'workshop_payment' is soft-deleted,
-- delete the corresponding workshop_payments record linked to it.

CREATE OR REPLACE FUNCTION public.cascade_transaction_delete_to_workshop_payments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when is_deleted changes from false to true
  IF NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false) THEN
    -- Delete workshop_payments linked to this transaction
    IF NEW.transaction_type = 'workshop_payment' THEN
      DELETE FROM public.workshop_payments WHERE linked_transaction_id = NEW.id;
    END IF;
    -- Delete workshop_costs linked to this transaction
    IF NEW.transaction_type = 'workshop_cost' THEN
      DELETE FROM public.workshop_costs WHERE linked_transaction_id = NEW.id;
    END IF;
  END IF;
  
  -- Restore: if is_deleted changes back to false, we can't restore deleted records
  -- but at least we handle the forward case
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_cascade_transaction_to_workshop ON public.transactions;

-- Create trigger on transactions table
CREATE TRIGGER trg_cascade_transaction_to_workshop
  AFTER UPDATE OF is_deleted ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_transaction_delete_to_workshop_payments();
