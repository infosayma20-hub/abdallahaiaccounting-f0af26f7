-- 1) invoice item -> stock movement must carry the invoice's warehouse
CREATE OR REPLACE FUNCTION public.sync_invoice_item_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_movement_type stock_movement_type;
  v_quantity numeric;
  v_note_prefix text;
  v_product_type text;
  v_warehouse_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.product_id IS NULL OR NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT product_type INTO v_product_type FROM public.products WHERE id = NEW.product_id;
  IF v_product_type = 'service' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_invoice.source_delivery_note_id IS NOT NULL THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_invoice.status IS NULL
     OR v_invoice.status IN ('draft','cancelled','void','voided') THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_invoice.invoice_type IN ('sale','sales') THEN
    v_movement_type := 'صادر'::stock_movement_type;
    v_quantity      := COALESCE(NEW.quantity,0) + COALESCE(NEW.bonus_quantity,0);
    v_note_prefix   := 'فاتورة مبيعات';
  ELSIF v_invoice.invoice_type = 'purchase' THEN
    v_movement_type := 'وارد'::stock_movement_type;
    v_quantity      := COALESCE(NEW.quantity,0);
    v_note_prefix   := 'فاتورة مشتريات';
  ELSE
    RETURN NEW;
  END IF;

  IF v_quantity = 0 THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = NEW.id;
    RETURN NEW;
  END IF;

  -- warehouse of the invoice; NULL falls back to the tenant default via
  -- trg_a_stock_movement_default_warehouse
  v_warehouse_id := v_invoice.warehouse_id;

  INSERT INTO public.stock_movements (
    product_id, quantity, movement_type, reference_note,
    user_id, reference_type, reference_id, reference_line_id, warehouse_id
  )
  VALUES (
    NEW.product_id, v_quantity, v_movement_type,
    v_note_prefix || ' ' || COALESCE(v_invoice.invoice_number,''),
    v_invoice.user_id, 'invoice', NEW.invoice_id, NEW.id, v_warehouse_id
  )
  ON CONFLICT (reference_line_id)
  WHERE reference_type = 'invoice' AND reference_line_id IS NOT NULL
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    movement_type = EXCLUDED.movement_type,
    reference_note = EXCLUDED.reference_note,
    warehouse_id = COALESCE(EXCLUDED.warehouse_id, public.stock_movements.warehouse_id);

  RETURN NEW;
END;
$function$;

-- 2) changing the invoice warehouse relocates its stock movements
CREATE OR REPLACE FUNCTION public.tg_invoice_warehouse_relocate_movements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.warehouse_id IS NOT NULL
     AND NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN
    UPDATE public.stock_movements
       SET warehouse_id = NEW.warehouse_id
     WHERE reference_type = 'invoice'
       AND reference_id = NEW.id
       AND warehouse_id IS DISTINCT FROM NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoice_warehouse_relocate_movements ON public.invoices;
CREATE TRIGGER trg_invoice_warehouse_relocate_movements
AFTER UPDATE OF warehouse_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_warehouse_relocate_movements();

-- 3) repair historical movements that sat in the wrong warehouse
UPDATE public.stock_movements m
   SET warehouse_id = i.warehouse_id
  FROM public.invoices i
 WHERE m.reference_type = 'invoice'
   AND m.reference_id = i.id
   AND i.warehouse_id IS NOT NULL
   AND m.warehouse_id IS DISTINCT FROM i.warehouse_id;