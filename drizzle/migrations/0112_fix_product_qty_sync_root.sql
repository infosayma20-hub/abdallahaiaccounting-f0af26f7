-- 1) Keep products.quantity in sync on UPDATE of a stock movement (invoice edits use ON CONFLICT DO UPDATE)
CREATE OR REPLACE FUNCTION public.tg_sync_product_qty_from_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old numeric;
  v_new numeric;
BEGIN
  PERFORM set_config('app.stock_sync', 'on', true);
  IF TG_OP = 'INSERT' THEN
    UPDATE public.products SET quantity = COALESCE(quantity,0) + public.stock_movement_signed_qty(NEW.movement_type, NEW.quantity), updated_at = now()
      WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.products SET quantity = COALESCE(quantity,0) - public.stock_movement_signed_qty(OLD.movement_type, OLD.quantity), updated_at = now()
      WHERE id = OLD.product_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := public.stock_movement_signed_qty(OLD.movement_type, OLD.quantity);
    v_new := public.stock_movement_signed_qty(NEW.movement_type, NEW.quantity);
    IF OLD.product_id IS NOT DISTINCT FROM NEW.product_id THEN
      IF v_new <> v_old THEN
        UPDATE public.products SET quantity = COALESCE(quantity,0) + (v_new - v_old), updated_at = now()
          WHERE id = NEW.product_id;
      END IF;
    ELSE
      UPDATE public.products SET quantity = COALESCE(quantity,0) - v_old, updated_at = now() WHERE id = OLD.product_id;
      UPDATE public.products SET quantity = COALESCE(quantity,0) + v_new, updated_at = now() WHERE id = NEW.product_id;
    END IF;
  END IF;
  PERFORM set_config('app.stock_sync', 'off', true);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_product_qty ON public.stock_movements;
CREATE TRIGGER trg_sync_product_qty
  AFTER INSERT OR DELETE OR UPDATE OF product_id, movement_type, quantity ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_product_qty_from_stock_movement();

-- 2) POS cancel: reverse stock through an audited movement, only for lines that were actually deducted
CREATE OR REPLACE FUNCTION public.pos_order_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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

    -- Reverse only stock that was really deducted (a sale movement exists); never touch products directly
    INSERT INTO public.stock_movements (
      user_id, product_id, movement_type, quantity,
      reference_type, reference_id, reference_note, warehouse_id, unit_cost
    )
    SELECT sm.user_id, sm.product_id, 'وارد'::stock_movement_type, sm.quantity,
           'pos_order_line_cancel', sm.reference_id, 'إلغاء طلب نقطة بيع', sm.warehouse_id, sm.unit_cost
    FROM public.pos_order_lines ol
    JOIN public.stock_movements sm
      ON sm.reference_type = 'pos_order_line_sale' AND sm.reference_id = ol.id
    WHERE ol.order_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements c
        WHERE c.reference_type = 'pos_order_line_cancel' AND c.reference_id = ol.id
      );
  END IF;

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