-- 1) Add optional override flag on purchase invoice line items
ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS track_inventory boolean;

COMMENT ON COLUMN public.purchase_invoice_items.track_inventory IS
  'Manual override: TRUE forces stock movement, FALSE skips it. NULL = fallback to products.product_type (product=track, service=skip).';

-- 2) Replace stock-in trigger function with hybrid logic
CREATE OR REPLACE FUNCTION public.handle_purchase_item_stock_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_branch_id uuid;
  v_warehouse_id uuid;
  v_invoice_no text;
  v_invoice_status text;
  v_product_type text;
  v_should_track boolean;
BEGIN
  -- Skip free-text items (no product linked) — treated as expense/service
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hybrid decision: explicit per-line override > product_type fallback
  IF NEW.track_inventory IS NOT NULL THEN
    v_should_track := NEW.track_inventory;
  ELSE
    SELECT product_type INTO v_product_type
    FROM public.products
    WHERE id = NEW.product_id;
    -- Default to tracking if type is null/'product'; skip if 'service'
    v_should_track := COALESCE(v_product_type, 'product') <> 'service';
  END IF;

  IF NOT v_should_track THEN
    RETURN NEW;
  END IF;

  -- Load parent invoice context
  SELECT user_id, branch_id, invoice_number, status
    INTO v_user_id, v_branch_id, v_invoice_no, v_invoice_status
  FROM public.purchase_invoices
  WHERE id = NEW.invoice_id;

  -- Don't track stock for cancelled invoices
  IF v_invoice_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Resolve target warehouse (branch default, excluding rep warehouses)
  v_warehouse_id := public.resolve_branch_warehouse(v_user_id, v_branch_id);

  IF v_warehouse_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotent insert (relies on uniq_stock_mvt_purchase_invoice_product partial unique idx)
  INSERT INTO public.stock_movements (
    user_id, product_id, warehouse_id,
    movement_type, quantity_in, quantity_out,
    unit_cost, reference_type, reference_id,
    notes, movement_date
  )
  VALUES (
    v_user_id, NEW.product_id, v_warehouse_id,
    'وارد', NEW.quantity, 0,
    NEW.unit_price, 'purchase_invoice', NEW.invoice_id,
    'فاتورة مشتريات ' || COALESCE(v_invoice_no, ''), now()
  )
  ON CONFLICT ON CONSTRAINT uniq_stock_mvt_purchase_invoice_product DO NOTHING;

  IF FOUND THEN
    UPDATE public.products
       SET quantity = COALESCE(quantity, 0) + NEW.quantity,
           updated_at = now()
     WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Replace cancellation trigger with the same hybrid filter
CREATE OR REPLACE FUNCTION public.handle_purchase_invoice_cancel_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_warehouse_id uuid;
  v_product_type text;
  v_should_track boolean;
BEGIN
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled' THEN
    v_warehouse_id := public.resolve_branch_warehouse(NEW.user_id, NEW.branch_id);
    IF v_warehouse_id IS NULL THEN
      RETURN NEW;
    END IF;

    FOR rec IN
      SELECT product_id, quantity, unit_price, track_inventory
      FROM public.purchase_invoice_items
      WHERE invoice_id = NEW.id AND product_id IS NOT NULL
    LOOP
      IF rec.track_inventory IS NOT NULL THEN
        v_should_track := rec.track_inventory;
      ELSE
        SELECT product_type INTO v_product_type FROM public.products WHERE id = rec.product_id;
        v_should_track := COALESCE(v_product_type, 'product') <> 'service';
      END IF;

      IF NOT v_should_track THEN
        CONTINUE;
      END IF;

      INSERT INTO public.stock_movements (
        user_id, product_id, warehouse_id,
        movement_type, quantity_in, quantity_out,
        unit_cost, reference_type, reference_id,
        notes, movement_date
      )
      VALUES (
        NEW.user_id, rec.product_id, v_warehouse_id,
        'صادر', 0, rec.quantity,
        rec.unit_price, 'purchase_invoice_cancel', NEW.id,
        'إلغاء فاتورة مشتريات ' || COALESCE(NEW.invoice_number, ''), now()
      );

      UPDATE public.products
         SET quantity = COALESCE(quantity, 0) - rec.quantity,
             updated_at = now()
       WHERE id = rec.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;