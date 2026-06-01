-- Fix: do NOT revert call_center_orders back to "pending" when the POS invoice
-- is cancelled. Instead, mark it as cancelled_after_acceptance so it never
-- re-appears in the cashier pending panel and never re-triggers the new-order sound.

CREATE OR REPLACE FUNCTION public.revert_call_center_order_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- POS order cancelled → mark linked call center order as cancelled_after_acceptance
  IF NEW.state = 'cancelled' AND OLD.state IS DISTINCT FROM 'cancelled' THEN
    UPDATE public.call_center_orders
    SET status = 'cancelled_after_acceptance',
        cancelled_at = COALESCE(NEW.cancelled_at, NOW()),
        cancel_reason = COALESCE(NEW.cancel_reason, 'إلغاء فاتورة POS المرتبطة'),
        updated_at = NOW()
    WHERE pos_order_id = NEW.id
      AND status IN ('accepted', 'completed');
  END IF;

  -- POS order paid → mark linked call center order as completed
  IF NEW.state = 'paid' AND OLD.state IS DISTINCT FROM 'paid' THEN
    UPDATE public.call_center_orders
    SET status = 'completed',
        updated_at = NOW()
    WHERE pos_order_id = NEW.id
      AND status = 'accepted';
  END IF;

  RETURN NEW;
END;
$$;

-- Add columns used above if they don't exist yet (cancel tracking on call_center_orders)
ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- One-time cleanup: any call_center_orders currently in "pending" but actually
-- linked to a cancelled POS order should be moved to cancelled_after_acceptance
-- so they don't keep popping up in the pending panel.
UPDATE public.call_center_orders cco
SET status = 'cancelled_after_acceptance',
    cancelled_at = COALESCE(cco.cancelled_at, po.cancelled_at, NOW()),
    cancel_reason = COALESCE(cco.cancel_reason, po.cancel_reason, 'إلغاء فاتورة POS المرتبطة'),
    updated_at = NOW()
FROM public.pos_orders po
WHERE cco.pos_order_id = po.id
  AND po.state = 'cancelled'
  AND cco.status = 'pending';