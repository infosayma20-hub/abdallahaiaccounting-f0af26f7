
-- V5: Consolidate POS cancel cascade to a single canonical trigger and gate
-- the stock restore on OLD.state = 'paid'.
-- Background:
--   * pos_order_after_update() and cascade_transaction_from_pos() were both
--     attached as AFTER UPDATE triggers on pos_orders and contained the same
--     restore block. Cancelling an order ran the restore twice.
--   * The restore block did not check OLD.state, so cancelling an open/draft
--     order (whose stock was never deducted) artificially inflated quantities.
-- Decision:
--   * Keep pos_order_after_update() as the canonical handler (it also owns the
--     restaurant_tables status updates).
--   * Drop the duplicate trigger trg_cascade_transaction_from_pos. The
--     cascade_transaction_from_pos() function is left in place (no callers
--     after this migration) to avoid breaking unknown external grants/usage.

DROP TRIGGER IF EXISTS trg_cascade_transaction_from_pos ON public.pos_orders;

CREATE OR REPLACE FUNCTION public.pos_order_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- === Cancel / void cascade: only when transitioning FROM paid ===
  -- Stock was only deducted when state became 'paid'. Restoring before that
  -- would inflate inventory. Accounting reversal also only makes sense for
  -- previously-posted orders.
  IF OLD.state = 'paid'
     AND NEW.state IN ('cancelled', 'voided')
     AND OLD.state IS DISTINCT FROM NEW.state
  THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = true
      WHERE id = NEW.linked_transaction_id AND is_deleted = false;
    END IF;

    UPDATE public.transactions
    SET is_deleted = true
    WHERE idempotency_key = 'COGS-' || NEW.id::text AND is_deleted = false;

    UPDATE public.products p
    SET quantity = p.quantity + ol.qty
    FROM public.pos_order_lines ol
    WHERE ol.order_id = NEW.id AND ol.product_id = p.id;
  END IF;

  -- === Table status (unchanged) ===
  IF NEW.table_id IS NOT NULL THEN
    IF NEW.state = 'paid' AND OLD.state != 'paid' THEN
      UPDATE public.restaurant_tables SET
        status = 'available', current_order_id = NULL,
        current_guests = 0, occupied_at = NULL, updated_at = NOW()
      WHERE id = NEW.table_id;
    END IF;

    IF NEW.state = 'cancelled' AND OLD.state != 'cancelled' THEN
      UPDATE public.restaurant_tables SET
        status = 'available', current_order_id = NULL,
        current_guests = 0, occupied_at = NULL, updated_at = NOW()
      WHERE id = NEW.table_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
