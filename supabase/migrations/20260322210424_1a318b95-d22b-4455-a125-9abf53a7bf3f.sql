
-- Add pos_order_id to track which POS order was created from this call center order
ALTER TABLE public.call_center_orders ADD COLUMN IF NOT EXISTS pos_order_id UUID;

-- Add completed status support (accepted → completed when paid)
-- Status flow: pending → accepted → completed
--                        accepted → pending (if POS order cancelled/deleted)

-- Create trigger to auto-revert call center order when POS order is cancelled
CREATE OR REPLACE FUNCTION public.revert_call_center_order_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When POS order is cancelled, revert the linked call center order back to pending
  IF NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
    UPDATE public.call_center_orders
    SET status = 'pending',
        accepted_by = NULL,
        accepted_at = NULL,
        session_id = NULL,
        pos_order_id = NULL,
        updated_at = NOW()
    WHERE pos_order_id = NEW.id
      AND status IN ('accepted', 'completed');
  END IF;

  -- When POS order is paid, mark call center order as completed
  IF NEW.state = 'paid' AND OLD.state != 'paid' THEN
    UPDATE public.call_center_orders
    SET status = 'completed',
        updated_at = NOW()
    WHERE pos_order_id = NEW.id
      AND status = 'accepted';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to pos_orders
DROP TRIGGER IF EXISTS trg_revert_call_center_order ON public.pos_orders;
CREATE TRIGGER trg_revert_call_center_order
  AFTER UPDATE ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.revert_call_center_order_on_cancel();
