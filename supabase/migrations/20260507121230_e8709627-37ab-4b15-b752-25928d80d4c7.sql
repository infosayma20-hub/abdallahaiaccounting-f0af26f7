-- =========================================================================
-- Purchase Invoice → Stock Movements (Atomic, Idempotent, Trigger-based)
-- =========================================================================
-- Goal: When a purchase_invoice_item is inserted, automatically:
--   1) Create a stock_movements row (movement_type='وارد', reference_type='purchase_invoice')
--   2) Increment products.quantity
--   3) Resolve warehouse_id from invoice's branch (default warehouse for that branch)
--      or user's default warehouse as fallback.
--   4) Skip silently if product_id is null (free-text item) or invoice is cancelled.
--   5) Idempotent: a partial unique index prevents duplicate movements for the
--      same (purchase_invoice_id, product_id).
--
-- This keeps the rep portal isolated: purchases hit the BRANCH warehouse only.
-- The rep warehouse is only fed via stock_transfers (existing flow).
-- =========================================================================

-- 1) Idempotency guard: unique movement per (invoice, product)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_mvt_purchase_invoice_product
  ON public.stock_movements (reference_id, product_id)
  WHERE reference_type = 'purchase_invoice';

-- 2) Helper: resolve a warehouse_id for a given user+branch
CREATE OR REPLACE FUNCTION public.resolve_branch_warehouse(
  p_user_id uuid,
  p_branch_id uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
BEGIN
  -- Prefer default warehouse for this branch
  IF p_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse_id
    FROM public.warehouses
    WHERE user_id = p_user_id
      AND branch_id = p_branch_id
      AND is_active = true
      AND warehouse_type <> 'rep'
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
    IF v_warehouse_id IS NOT NULL THEN RETURN v_warehouse_id; END IF;
  END IF;

  -- Fallback: user's default non-rep warehouse
  SELECT id INTO v_warehouse_id
  FROM public.warehouses
  WHERE user_id = p_user_id
    AND is_active = true
    AND COALESCE(warehouse_type, '') <> 'rep'
  ORDER BY is_default DESC NULLS LAST, created_at ASC
  LIMIT 1;

  RETURN v_warehouse_id;
END;
$$;

-- 3) Trigger function: on purchase_invoice_items insert → create stock movement
CREATE OR REPLACE FUNCTION public.handle_purchase_item_stock_in()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_branch_id uuid;
  v_status text;
  v_warehouse_id uuid;
  v_invoice_number text;
BEGIN
  -- Skip free-text items
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pull invoice context
  SELECT user_id, branch_id, status, invoice_number
    INTO v_user_id, v_branch_id, v_status, v_invoice_number
  FROM public.purchase_invoices
  WHERE id = NEW.invoice_id;

  IF v_user_id IS NULL THEN
    RETURN NEW; -- orphan; let FK handle it
  END IF;

  -- Skip cancelled invoices
  IF v_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Resolve warehouse
  v_warehouse_id := public.resolve_branch_warehouse(v_user_id, v_branch_id);

  -- Insert stock movement (idempotent via unique index)
  INSERT INTO public.stock_movements (
    user_id, product_id, warehouse_id,
    movement_type, quantity, unit_cost,
    reference_type, reference_id, reference_note, notes
  ) VALUES (
    v_user_id, NEW.product_id, v_warehouse_id,
    'وارد', NEW.quantity, NEW.unit_price,
    'purchase_invoice', NEW.invoice_id,
    'فاتورة مشتريات ' || COALESCE(v_invoice_number, ''),
    CASE WHEN NEW.batch_no IS NOT NULL OR NEW.expiry_date IS NOT NULL
      THEN jsonb_build_object('batch_no', NEW.batch_no, 'expiry_date', NEW.expiry_date, 'production_date', NEW.production_date)::text
      ELSE NULL END
  )
  ON CONFLICT (reference_id, product_id) WHERE reference_type = 'purchase_invoice'
  DO NOTHING;

  -- Increment product quantity (only if a movement was actually inserted)
  IF FOUND THEN
    UPDATE public.products
    SET quantity = COALESCE(quantity, 0) + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.product_id AND user_id = v_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_item_stock_in ON public.purchase_invoice_items;
CREATE TRIGGER trg_purchase_item_stock_in
AFTER INSERT ON public.purchase_invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_purchase_item_stock_in();

-- 4) Reversal trigger: when a purchase invoice is cancelled, reverse movements
CREATE OR REPLACE FUNCTION public.handle_purchase_invoice_cancel_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status = 'cancelled' AND COALESCE(OLD.status,'') <> 'cancelled' THEN
    FOR r IN
      SELECT product_id, warehouse_id, quantity, unit_cost
      FROM public.stock_movements
      WHERE reference_type = 'purchase_invoice'
        AND reference_id = NEW.id
        AND movement_type = 'وارد'
    LOOP
      INSERT INTO public.stock_movements (
        user_id, product_id, warehouse_id,
        movement_type, quantity, unit_cost,
        reference_type, reference_id, reference_note
      ) VALUES (
        NEW.user_id, r.product_id, r.warehouse_id,
        'صادر', r.quantity, r.unit_cost,
        'purchase_invoice_cancel', NEW.id,
        'إلغاء فاتورة مشتريات ' || COALESCE(NEW.invoice_number,'')
      );

      UPDATE public.products
      SET quantity = COALESCE(quantity, 0) - r.quantity,
          updated_at = now()
      WHERE id = r.product_id AND user_id = NEW.user_id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_invoice_cancel_stock ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoice_cancel_stock
AFTER UPDATE OF status ON public.purchase_invoices
FOR EACH ROW
EXECUTE FUNCTION public.handle_purchase_invoice_cancel_stock();