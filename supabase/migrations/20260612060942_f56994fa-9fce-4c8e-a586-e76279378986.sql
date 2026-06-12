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
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.product_id IS NULL OR NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

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

  INSERT INTO public.stock_movements (
    product_id, quantity, movement_type, reference_note,
    user_id, reference_type, reference_id, reference_line_id
  )
  VALUES (
    NEW.product_id, v_quantity, v_movement_type,
    v_note_prefix || ' ' || COALESCE(v_invoice.invoice_number,''),
    v_invoice.user_id, 'invoice', NEW.invoice_id, NEW.id
  )
  ON CONFLICT (reference_line_id) WHERE reference_type = 'invoice' AND reference_line_id IS NOT NULL
  DO UPDATE SET
    product_id     = EXCLUDED.product_id,
    quantity       = EXCLUDED.quantity,
    movement_type  = EXCLUDED.movement_type,
    reference_note = EXCLUDED.reference_note,
    reference_id   = EXCLUDED.reference_id;

  RETURN NEW;
END;
$function$;