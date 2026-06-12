
-- ============================================================
-- WB-1 Fix: ربط stock_movements بسطر الفاتورة (invoice_item) بدل (invoice, product)
-- ============================================================

-- 1) إضافة عمود ربط بسطر الفاتورة
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reference_line_id uuid;

COMMENT ON COLUMN public.stock_movements.reference_line_id IS
  'يربط الحركة بسطر مستند فردي (مثل invoice_items.id) — يسمح بعدة أسطر لنفس المنتج بالفاتورة الواحدة';

-- 2) Backfill: مزاوجة الحركات الموجودة مع invoice_items عبر ROW_NUMBER على created_at
WITH items_ranked AS (
  SELECT ii.id AS item_id, ii.invoice_id, ii.product_id, ii.quantity, ii.bonus_quantity,
         ROW_NUMBER() OVER (PARTITION BY ii.invoice_id, ii.product_id ORDER BY ii.created_at, ii.id) AS rn
  FROM public.invoice_items ii
  WHERE ii.product_id IS NOT NULL
),
movs_ranked AS (
  SELECT sm.id AS mov_id, sm.reference_id AS invoice_id, sm.product_id,
         ROW_NUMBER() OVER (PARTITION BY sm.reference_id, sm.product_id ORDER BY sm.created_at, sm.id) AS rn
  FROM public.stock_movements sm
  WHERE sm.reference_type = 'invoice'
    AND sm.reference_line_id IS NULL
),
pairs AS (
  SELECT m.mov_id, i.item_id
  FROM movs_ranked m
  JOIN items_ranked i
    ON i.invoice_id = m.invoice_id
   AND i.product_id = m.product_id
   AND i.rn = m.rn
)
UPDATE public.stock_movements sm
SET reference_line_id = p.item_id
FROM pairs p
WHERE sm.id = p.mov_id;

-- 3) حذف الحركات الفائضة (لا يقابلها سطر فاتورة) — هذه نتيجة تعديلات سابقة قبل التريغر
DELETE FROM public.stock_movements
WHERE reference_type = 'invoice'
  AND reference_line_id IS NULL;

-- 4) فهرس UNIQUE صارم على ربط الحركة بسطر الفاتورة
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_mvt_invoice_line
  ON public.stock_movements (reference_line_id)
  WHERE reference_type = 'invoice' AND reference_line_id IS NOT NULL;

-- 5) إسقاط الفهرس القديم غير الفريد (لم يعد ملائماً للمفتاح الجديد)
DROP INDEX IF EXISTS public.idx_stock_mvt_invoice_lookup;

-- فهرس بديل أخف للاستعلامات حسب الفاتورة
CREATE INDEX IF NOT EXISTS idx_stock_mvt_invoice_ref
  ON public.stock_movements (reference_id)
  WHERE reference_type = 'invoice';

-- 6) إعادة بناء الدالة لاستخدام invoice_item.id كمفتاح ربط
CREATE OR REPLACE FUNCTION public.sync_invoice_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_movement_type text;
  v_quantity numeric;
  v_note_prefix text;
BEGIN
  -- ───────── DELETE: حذف الحركة المرتبطة بهذا السطر تحديداً ─────────
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice'
      AND reference_line_id = OLD.id;
    RETURN OLD;
  END IF;

  -- ───────── INSERT/UPDATE ─────────
  IF NEW.product_id IS NULL OR NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = NEW.invoice_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- تخطّى المسودات والملغاة
  IF v_invoice.status IS NULL
     OR v_invoice.status IN ('draft','cancelled','void','voided') THEN
    -- إن كانت الفاتورة أصبحت ملغاة بعد إنشاء الحركة، نظّف
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = NEW.id;
    RETURN NEW;
  END IF;

  -- اتجاه الحركة
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

  IF v_quantity = 0 THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'invoice' AND reference_line_id = NEW.id;
    RETURN NEW;
  END IF;

  -- UPSERT حسب reference_line_id
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
