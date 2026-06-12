-- ============================================================
-- WB-1: Idempotent stock_movements writer for legacy invoices path
-- ============================================================
-- يضمن أن كل فاتورة (invoice_type='sale'|'sales'|'purchase')
-- ذات بنود مرتبطة بمنتج تنشئ stock_movements تلقائياً عبر الـ DB.
-- آمن: idempotent (لا يكرر)، لا يلمس المسودات، يحترم 'invoice_void'
-- المسار البديل (purchase_invoices) ليس متأثراً.

CREATE OR REPLACE FUNCTION public.sync_invoice_item_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_movement_type text;
  v_quantity numeric;
  v_note_prefix text;
BEGIN
  -- ───────── DELETE: حذف الحركة المرتبطة بالبند ─────────
  IF TG_OP = 'DELETE' THEN
    IF OLD.product_id IS NOT NULL AND OLD.invoice_id IS NOT NULL THEN
      DELETE FROM public.stock_movements
      WHERE reference_type = 'invoice'
        AND reference_id  = OLD.invoice_id
        AND product_id    = OLD.product_id;
    END IF;
    RETURN OLD;
  END IF;

  -- ───────── INSERT/UPDATE: تحقّق من الفاتورة ─────────
  IF NEW.product_id IS NULL OR NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- لا تكتب للمسودات أو الفواتير الملغاة (cancelled/void/draft)
  IF v_invoice.status IS NULL
     OR v_invoice.status IN ('draft','cancelled','void','voided') THEN
    RETURN NEW;
  END IF;

  -- حدّد اتجاه الحركة (مبيعات=صادر، مشتريات=وارد)
  IF v_invoice.invoice_type IN ('sale','sales') THEN
    v_movement_type := 'صادر';
    v_quantity      := COALESCE(NEW.quantity,0) + COALESCE(NEW.bonus_quantity,0);
    v_note_prefix   := 'فاتورة مبيعات';
  ELSIF v_invoice.invoice_type = 'purchase' THEN
    v_movement_type := 'وارد';
    v_quantity      := COALESCE(NEW.quantity,0);
    v_note_prefix   := 'فاتورة مشتريات';
  ELSE
    RETURN NEW;
  END IF;

  IF v_quantity = 0 THEN RETURN NEW; END IF;

  -- ───────── UPDATE: حدّث الحركة الموجودة إن وُجدت ─────────
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.stock_movements
    SET quantity       = v_quantity,
        movement_type  = v_movement_type,
        reference_note = v_note_prefix || ' ' || COALESCE(v_invoice.invoice_number,'')
    WHERE reference_type = 'invoice'
      AND reference_id  = NEW.invoice_id
      AND product_id    = NEW.product_id;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;

  -- ───────── INSERT (idempotent): فقط لو لا توجد حركة مسبقة ─────────
  INSERT INTO public.stock_movements (
    product_id, quantity, movement_type, reference_note,
    user_id, reference_type, reference_id
  )
  SELECT NEW.product_id, v_quantity, v_movement_type,
         v_note_prefix || ' ' || COALESCE(v_invoice.invoice_number,''),
         v_invoice.user_id, 'invoice', NEW.invoice_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_type = 'invoice'
      AND reference_id  = NEW.invoice_id
      AND product_id    = NEW.product_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_item_stock_sync ON public.invoice_items;

CREATE TRIGGER trg_invoice_item_stock_sync
AFTER INSERT OR UPDATE OF quantity, bonus_quantity, product_id, invoice_id
   OR DELETE
ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_item_stock();

-- فهرس داعم للأداء (غير فريد بسبب 25 فاتورة فيها duplicates تاريخية)
CREATE INDEX IF NOT EXISTS idx_stock_mvt_invoice_lookup
  ON public.stock_movements (reference_type, reference_id, product_id)
  WHERE reference_type = 'invoice';

COMMENT ON FUNCTION public.sync_invoice_item_stock() IS
'WB-1 DB-level writer: ينشئ/يحدّث/يحذف stock_movements تلقائياً للفواتير غير المسودة (invoices.invoice_type). Idempotent — يتعايش مع كاتب الواجهة بدون تكرار. لا يلمس purchase_invoices.';