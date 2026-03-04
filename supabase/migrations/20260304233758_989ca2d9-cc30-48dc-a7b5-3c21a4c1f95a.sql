
-- Trigger: when a transaction linked to a POS order is soft-deleted, 
-- also soft-delete the POS order and its related data
CREATE OR REPLACE FUNCTION public.cascade_pos_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When transaction is soft-deleted
  IF NEW.is_deleted = true AND (OLD.is_deleted = false OR OLD.is_deleted IS NULL) THEN
    -- Find and cancel linked POS order
    UPDATE public.pos_orders
    SET state = 'cancelled', updated_at = now()
    WHERE linked_transaction_id = NEW.id
      AND state != 'cancelled';
    
    -- Also soft-delete the COGS transaction if exists
    UPDATE public.transactions
    SET is_deleted = true
    WHERE idempotency_key = 'COGS-' || (
      SELECT id::text FROM public.pos_orders WHERE linked_transaction_id = NEW.id LIMIT 1
    )
    AND is_deleted = false
    AND id != NEW.id;
  END IF;

  -- When transaction is restored (un-deleted)
  IF NEW.is_deleted = false AND OLD.is_deleted = true THEN
    UPDATE public.pos_orders
    SET state = 'paid', updated_at = now()
    WHERE linked_transaction_id = NEW.id
      AND state = 'cancelled';
    
    -- Restore COGS transaction
    UPDATE public.transactions
    SET is_deleted = false
    WHERE idempotency_key = 'COGS-' || (
      SELECT id::text FROM public.pos_orders WHERE linked_transaction_id = NEW.id LIMIT 1
    )
    AND is_deleted = true
    AND id != NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cascade_pos_soft_delete
  AFTER UPDATE OF is_deleted ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_pos_soft_delete();

-- Trigger: when a POS order is cancelled, soft-delete its linked transaction
CREATE OR REPLACE FUNCTION public.cascade_transaction_from_pos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
    -- Soft-delete linked sales transaction
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = false;
    END IF;
    
    -- Soft-delete linked COGS transaction
    UPDATE public.transactions
    SET is_deleted = true
    WHERE idempotency_key = 'COGS-' || NEW.id::text
      AND is_deleted = false;

    -- Restore stock quantities
    UPDATE public.products p
    SET quantity = p.quantity + ol.qty
    FROM public.pos_order_lines ol
    WHERE ol.order_id = NEW.id
      AND ol.product_id = p.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cascade_transaction_from_pos
  AFTER UPDATE OF state ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_transaction_from_pos();
