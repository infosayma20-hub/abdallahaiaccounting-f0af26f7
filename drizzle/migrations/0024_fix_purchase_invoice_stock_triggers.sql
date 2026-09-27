-- Per-line idempotency for purchase invoice stock-in (allows the same product on two lines)
DROP INDEX IF EXISTS public.uniq_stock_mvt_purchase_invoice_product;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_mvt_purchase_invoice_line
  ON public.stock_movements (reference_line_id)
  WHERE reference_type = 'purchase_invoice' AND reference_line_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_mvt_purchase_invoice_cancel_line
  ON public.stock_movements (reference_line_id)
  WHERE reference_type = 'purchase_invoice_cancel' AND reference_line_id IS NOT NULL;

-- Stock-in on purchase invoice line. products.quantity is maintained by trg_sync_product_qty on stock_movements.
CREATE OR REPLACE FUNCTION public.handle_purchase_item_stock_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user_id uuid; v_branch_id uuid; v_warehouse_id uuid; v_invoice_no text; v_invoice_status text;
  v_product_type text; v_should_track boolean;
BEGIN
  IF NEW.product_id IS NULL OR coalesce(NEW.quantity,0) <= 0 THEN RETURN NEW; END IF;
  IF NEW.track_inventory IS NOT NULL THEN
    v_should_track := NEW.track_inventory;
  ELSE
    SELECT product_type INTO v_product_type FROM public.products WHERE id = NEW.product_id;
    v_should_track := COALESCE(v_product_type, 'product') <> 'service';
  END IF;
  IF NOT v_should_track THEN RETURN NEW; END IF;

  SELECT user_id, branch_id, invoice_number, status
    INTO v_user_id, v_branch_id, v_invoice_no, v_invoice_status
  FROM public.purchase_invoices WHERE id = NEW.invoice_id;
  IF v_invoice_status = 'cancelled' THEN RETURN NEW; END IF;

  v_warehouse_id := public.resolve_branch_warehouse(v_user_id, v_branch_id);

  INSERT INTO public.stock_movements (
    user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, reference_line_id, notes, reference_note)
  VALUES (
    v_user_id, NEW.product_id, v_warehouse_id, 'وارد', NEW.quantity, NEW.unit_price,
    'purchase_invoice', NEW.invoice_id, NEW.id,
    'فاتورة مشتريات ' || COALESCE(v_invoice_no, ''),
    CASE WHEN NEW.expiry_date IS NOT NULL THEN 'انتهاء ' || NEW.expiry_date::text END)
  ON CONFLICT (reference_line_id) WHERE reference_type = 'purchase_invoice' AND reference_line_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Reverse exactly the stock-in movements of a cancelled purchase invoice
CREATE OR REPLACE FUNCTION public.handle_purchase_invoice_cancel_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE rec record;
BEGIN
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled' THEN
    FOR rec IN
      SELECT * FROM public.stock_movements
      WHERE reference_type = 'purchase_invoice' AND reference_id = NEW.id AND reference_line_id IS NOT NULL
    LOOP
      INSERT INTO public.stock_movements (
        user_id, product_id, warehouse_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, reference_line_id, notes)
      VALUES (
        rec.user_id, rec.product_id, rec.warehouse_id, 'صادر', rec.quantity, rec.unit_cost,
        'purchase_invoice_cancel', NEW.id, rec.reference_line_id,
        'إلغاء فاتورة مشتريات ' || COALESCE(NEW.invoice_number, ''))
      ON CONFLICT (reference_line_id) WHERE reference_type = 'purchase_invoice_cancel' AND reference_line_id IS NOT NULL DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;