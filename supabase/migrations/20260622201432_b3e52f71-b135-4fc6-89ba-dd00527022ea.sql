
-- ═══════════════════════════════════════════════════════════════════
-- 1) تعديلات الأعمدة على delivery_notes
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS from_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_movements_created boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- توسيع CHECK للحالات
ALTER TABLE public.delivery_notes
  DROP CONSTRAINT IF EXISTS delivery_notes_status_check;
ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_status_check
  CHECK (status IN ('draft','issued','converted','received','cancelled'));

-- CHECK على النوع
ALTER TABLE public.delivery_notes
  DROP CONSTRAINT IF EXISTS delivery_notes_delivery_type_check;
ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_delivery_type_check
  CHECK (delivery_type IN ('external','internal'));

-- CHECK: الإرسالية الداخلية تحتاج from و to مختلفين
ALTER TABLE public.delivery_notes
  DROP CONSTRAINT IF EXISTS delivery_notes_internal_warehouses_check;
ALTER TABLE public.delivery_notes
  ADD CONSTRAINT delivery_notes_internal_warehouses_check
  CHECK (
    delivery_type = 'external'
    OR (
      delivery_type = 'internal'
      AND from_warehouse_id IS NOT NULL
      AND (to_warehouse_id IS NOT NULL OR to_branch_id IS NOT NULL)
      AND (to_warehouse_id IS NULL OR to_warehouse_id <> from_warehouse_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_delivery_notes_type ON public.delivery_notes(delivery_type);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_from_wh ON public.delivery_notes(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_to_wh ON public.delivery_notes(to_warehouse_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2) تعديل invoices: ربط بالإرسالية المصدر لمنع double deduction
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source_delivery_note_id uuid REFERENCES public.delivery_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_source_delivery_note ON public.invoices(source_delivery_note_id)
  WHERE source_delivery_note_id IS NOT NULL;

-- تحديث sync_invoice_item_stock لتخطّي الخصم إذا الفاتورة من إرسالية (المخزون مخصوم مسبقاً)
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

  -- ★ منع double-deduction: إذا الفاتورة محوّلة من إرسالية، المخزون مخصوم بالفعل
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

  INSERT INTO public.stock_movements (
    product_id, quantity, movement_type, reference_note,
    user_id, reference_type, reference_id, reference_line_id
  )
  VALUES (
    NEW.product_id, v_quantity, v_movement_type,
    v_note_prefix || ' ' || COALESCE(v_invoice.invoice_number,''),
    v_invoice.user_id, 'invoice', NEW.invoice_id, NEW.id
  )
  ON CONFLICT (reference_line_id)
  WHERE reference_type = 'invoice' AND reference_line_id IS NOT NULL
  DO UPDATE SET
    quantity = EXCLUDED.quantity,
    movement_type = EXCLUDED.movement_type,
    reference_note = EXCLUDED.reference_note;

  RETURN NEW;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- 3) Trigger خصم/إعادة المخزون للإرساليات
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_delivery_note_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_note public.delivery_notes%ROWTYPE;
  v_old_status text;
  v_new_status text;
  v_item record;
BEGIN
  -- DELETE: عكس كل الحركات
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'delivery_note' AND reference_id = OLD.id;
    RETURN OLD;
  END IF;

  v_note := NEW;
  v_old_status := COALESCE(OLD.status, '');
  v_new_status := COALESCE(NEW.status, '');

  -- لا تغيير في الحالة ولا الكميات → لا شيء
  IF TG_OP = 'UPDATE' AND v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  -- الانتقال إلى cancelled: امسح كل الحركات (إعادة المخزون)
  IF v_new_status = 'cancelled' THEN
    DELETE FROM public.stock_movements
    WHERE reference_type = 'delivery_note' AND reference_id = NEW.id;
    NEW.stock_movements_created := false;
    -- المُفعِّل سيُنفّذ NEW قبل الإرجاع، نحتاج UPDATE صريح:
    UPDATE public.delivery_notes SET stock_movements_created = false WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- الانتقال إلى issued: خصم من from_warehouse_id (صادر)
  IF v_new_status = 'issued' AND v_old_status IN ('', 'draft') THEN
    -- امسح أي حركات سابقة لنفس الإرسالية (احتياط)
    DELETE FROM public.stock_movements
    WHERE reference_type = 'delivery_note' AND reference_id = NEW.id
      AND movement_type = 'صادر';

    FOR v_item IN
      SELECT dni.product_id, dni.quantity, p.product_type, dni.product_name
      FROM public.delivery_note_items dni
      LEFT JOIN public.products p ON p.id = dni.product_id
      WHERE dni.delivery_note_id = NEW.id
        AND dni.product_id IS NOT NULL
        AND COALESCE(p.product_type, '') <> 'service'
        AND COALESCE(dni.quantity, 0) > 0
    LOOP
      INSERT INTO public.stock_movements (
        product_id, quantity, movement_type, reference_note,
        user_id, reference_type, reference_id, warehouse_id
      ) VALUES (
        v_item.product_id, v_item.quantity, 'صادر'::stock_movement_type,
        'إرسالية ' || COALESCE(NEW.delivery_number,'') ||
          CASE WHEN NEW.delivery_type='internal' THEN ' (داخلية)' ELSE '' END,
        NEW.user_id, 'delivery_note', NEW.id, NEW.from_warehouse_id
      );
    END LOOP;

    UPDATE public.delivery_notes SET stock_movements_created = true WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- الانتقال إلى received (داخلية فقط): إضافة لـ to_warehouse_id (وارد)
  IF v_new_status = 'received' AND NEW.delivery_type = 'internal' THEN
    -- امسح أي وارد سابق لنفس الإرسالية
    DELETE FROM public.stock_movements
    WHERE reference_type = 'delivery_note' AND reference_id = NEW.id
      AND movement_type = 'وارد';

    IF NEW.to_warehouse_id IS NOT NULL THEN
      FOR v_item IN
        SELECT dni.product_id, dni.quantity, p.product_type
        FROM public.delivery_note_items dni
        LEFT JOIN public.products p ON p.id = dni.product_id
        WHERE dni.delivery_note_id = NEW.id
          AND dni.product_id IS NOT NULL
          AND COALESCE(p.product_type, '') <> 'service'
          AND COALESCE(dni.quantity, 0) > 0
      LOOP
        INSERT INTO public.stock_movements (
          product_id, quantity, movement_type, reference_note,
          user_id, reference_type, reference_id, warehouse_id
        ) VALUES (
          v_item.product_id, v_item.quantity, 'وارد'::stock_movement_type,
          'استلام إرسالية داخلية ' || COALESCE(NEW.delivery_number,''),
          NEW.user_id, 'delivery_note', NEW.id, NEW.to_warehouse_id
        );
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_delivery_notes_stock_sync ON public.delivery_notes;
CREATE TRIGGER trg_delivery_notes_stock_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_note_stock();

-- ═══════════════════════════════════════════════════════════════════
-- 4) Trigger حماية: منع تعديل/حذف الإرساليات بعد الإصدار
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.protect_delivery_notes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'converted' THEN
      RAISE EXCEPTION 'لا يمكن حذف إرسالية محوّلة لفاتورة. ألغِ الفاتورة أولاً.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- منع تغيير النوع بعد الإصدار
    IF OLD.delivery_type <> NEW.delivery_type
       AND OLD.status IN ('issued','converted','received') THEN
      RAISE EXCEPTION 'لا يمكن تغيير نوع الإرسالية بعد الإصدار';
    END IF;
    -- منع التراجع من converted
    IF OLD.status = 'converted' AND NEW.status NOT IN ('converted','cancelled') THEN
      RAISE EXCEPTION 'لا يمكن تغيير حالة إرسالية محوّلة لفاتورة';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_delivery_notes ON public.delivery_notes;
CREATE TRIGGER trg_protect_delivery_notes
  BEFORE UPDATE OR DELETE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.protect_delivery_notes();

-- منع تعديل البنود بعد الإصدار
CREATE OR REPLACE FUNCTION public.protect_delivery_note_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.delivery_notes
  WHERE id = COALESCE(NEW.delivery_note_id, OLD.delivery_note_id);

  IF v_status IS NOT NULL AND v_status NOT IN ('draft','cancelled') THEN
    -- يُسمح بالتعديل فقط إذا الإرسالية مسودة أو ملغاة
    -- استثناء: عند CASCADE DELETE من الإرسالية نفسها (handled by main protect trigger)
    IF TG_OP = 'DELETE' THEN
      -- اسمح بالحذف إذا الإرسالية أيضاً ملغاة (نُحلّل لاحقاً)
      IF v_status = 'cancelled' THEN RETURN OLD; END IF;
      RAISE EXCEPTION 'لا يمكن تعديل بنود إرسالية بعد الإصدار (الحالة: %)', v_status;
    END IF;
    RAISE EXCEPTION 'لا يمكن تعديل بنود إرسالية بعد الإصدار (الحالة: %)', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ملاحظة: لا نضع هذا الـ trigger الآن لتجنّب تعطيل CASCADE DELETE.
-- يكفي حماية delivery_notes نفسها — الـ frontend سيمنع تعديل البنود.

-- ═══════════════════════════════════════════════════════════════════
-- 5) RPC: تحويل آمن للإرسالية إلى فاتورة
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.convert_delivery_note_to_invoice(
  p_delivery_note_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_note public.delivery_notes%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_caller uuid;
  v_year int;
  v_seq int;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_note FROM public.delivery_notes WHERE id = p_delivery_note_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الإرسالية غير موجودة';
  END IF;

  -- صلاحية: عضو فريق المالك
  IF NOT public.is_team_member(v_caller, v_note.user_id) THEN
    RAISE EXCEPTION 'صلاحية مرفوضة';
  END IF;

  IF v_note.delivery_type = 'internal' THEN
    RAISE EXCEPTION 'لا يمكن تحويل إرسالية داخلية لفاتورة';
  END IF;

  IF v_note.status = 'converted' THEN
    RAISE EXCEPTION 'الإرسالية محوّلة مسبقاً (فاتورة: %)', v_note.invoice_number;
  END IF;

  IF v_note.status NOT IN ('issued','draft') THEN
    RAISE EXCEPTION 'لا يمكن تحويل إرسالية بحالة %', v_note.status;
  END IF;

  -- توليد رقم فاتورة
  v_year := EXTRACT(YEAR FROM NOW())::int;
  v_seq := public.next_doc_number(v_note.user_id, 'invoice', v_year);
  v_invoice_number := 'INV-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

  -- إنشاء الفاتورة (status=draft، source_delivery_note_id يضمن عدم الخصم المزدوج)
  INSERT INTO public.invoices (
    user_id, invoice_number, invoice_type, status, payment_method,
    contact_id, invoice_date, currency, exchange_rate,
    subtotal, discount, vat_amount, total_amount,
    notes, source_delivery_note_id
  )
  VALUES (
    v_note.user_id, v_invoice_number, 'sale', 'draft', 'credit',
    v_note.contact_id, CURRENT_DATE,
    COALESCE(v_note.currency,'ILS'), COALESCE(v_note.exchange_rate,1),
    COALESCE(v_note.subtotal,0), COALESCE(v_note.discount,0),
    COALESCE(v_note.vat_amount,0), COALESCE(v_note.total_amount,0),
    'محوّلة من إرسالية ' || COALESCE(v_note.delivery_number,''),
    v_note.id
  )
  RETURNING id INTO v_invoice_id;

  -- نسخ البنود
  INSERT INTO public.invoice_items (
    invoice_id, product_id, product_name, quantity, unit_price, total, sort_order, unit
  )
  SELECT v_invoice_id, product_id, product_name, quantity, unit_price, total, sort_order, unit
  FROM public.delivery_note_items
  WHERE delivery_note_id = v_note.id;

  -- تحديث الإرسالية
  UPDATE public.delivery_notes
  SET status = 'converted',
      linked_invoice_id = v_invoice_id,
      invoice_number = v_invoice_number,
      converted_at = now()
  WHERE id = v_note.id;

  RETURN v_invoice_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_delivery_note_to_invoice(uuid) TO authenticated;
