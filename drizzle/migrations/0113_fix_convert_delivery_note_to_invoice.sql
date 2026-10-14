CREATE OR REPLACE FUNCTION public.convert_delivery_note_to_invoice(p_delivery_note_id uuid)
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
  v_contact_name text;
  v_tax_rate numeric := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- قفل الإرسالية لمنع التحويل المزدوج من جهازين
  SELECT * INTO v_note FROM public.delivery_notes WHERE id = p_delivery_note_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الإرسالية غير موجودة';
  END IF;

  IF NOT public.is_team_member(v_caller, v_note.user_id) THEN
    RAISE EXCEPTION 'صلاحية مرفوضة';
  END IF;

  IF v_note.delivery_type = 'internal' THEN
    RAISE EXCEPTION 'لا يمكن تحويل إرسالية داخلية لفاتورة';
  END IF;

  IF v_note.status = 'converted' THEN
    RAISE EXCEPTION 'الإرسالية محوّلة مسبقاً (فاتورة: %)', v_note.invoice_number;
  END IF;

  IF v_note.status <> 'issued' THEN
    RAISE EXCEPTION 'يجب إصدار الإرسالية وخصم المخزون قبل التحويل لفاتورة (الحالة الحالية: %)', v_note.status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE source_delivery_note_id = v_note.id
      AND COALESCE(status,'') NOT IN ('cancelled','void','voided')
      AND COALESCE(is_voided,false) = false
  ) THEN
    RAISE EXCEPTION 'يوجد فاتورة قائمة مرتبطة بهذه الإرسالية';
  END IF;

  v_contact_name := NULLIF(trim(COALESCE(v_note.contact_name,'')), '');
  IF v_contact_name IN ('---','-') THEN v_contact_name := NULL; END IF;
  IF v_contact_name IS NULL AND v_note.contact_id IS NOT NULL THEN
    SELECT contact_name INTO v_contact_name FROM public.contacts WHERE id = v_note.contact_id;
  END IF;

  IF COALESCE(v_note.vat_amount,0) > 0 AND COALESCE(v_note.subtotal,0) > 0 THEN
    v_tax_rate := round(v_note.vat_amount / v_note.subtotal * 100, 2);
  END IF;

  -- رقم الفاتورة يولّده مشغّل الترقيم الموحّد (trg_40_invoice_number)
  -- الفاتورة مسودة: القيد يُنشأ عند اعتمادها من شاشة الفاتورة،
  -- والمخزون لا يُخصم مرة ثانية لأنها مرتبطة بإرسالية (source_delivery_note_id).
  INSERT INTO public.invoices (
    user_id, invoice_type, status, payment_method, payment_status,
    contact_id, contact_name, invoice_date, currency, exchange_rate,
    subtotal, discount_amount, tax_amount, total_amount,
    paid_amount, remaining_amount, tax_inclusive,
    notes, source_delivery_note_id, warehouse_id, source
  )
  VALUES (
    v_note.user_id, 'sale', 'draft', 'آجل', 'unpaid',
    v_note.contact_id, v_contact_name, CURRENT_DATE,
    COALESCE(v_note.currency,'شيكل'), COALESCE(v_note.exchange_rate,1),
    COALESCE(v_note.subtotal,0), COALESCE(v_note.discount,0),
    COALESCE(v_note.vat_amount,0), COALESCE(v_note.total_amount,0),
    0, COALESCE(v_note.total_amount,0), false,
    'محوّلة من إرسالية ' || COALESCE(v_note.delivery_number,''),
    v_note.id, v_note.from_warehouse_id, 'delivery_note'
  )
  RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

  INSERT INTO public.invoice_items (
    invoice_id, product_id, product_name, description, quantity, unit_price,
    discount, tax_rate, total_amount, unit_of_measure, delivered_quantity
  )
  SELECT v_invoice_id, product_id, product_name, notes, quantity, unit_price,
         0, v_tax_rate, COALESCE(total, quantity * unit_price), unit, quantity
  FROM public.delivery_note_items
  WHERE delivery_note_id = v_note.id
  ORDER BY sort_order NULLS LAST, id;

  UPDATE public.delivery_notes
  SET status = 'converted',
      linked_invoice_id = v_invoice_id,
      invoice_number = v_invoice_number,
      converted_at = now()
  WHERE id = v_note.id;

  RETURN v_invoice_id;
END;
$function$;

-- السماح بإرجاع الإرسالية إلى «صادرة» فقط عبر مسار تحرير الفاتورة المرتبطة
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
    IF OLD.delivery_type <> NEW.delivery_type
       AND OLD.status IN ('issued','converted','received') THEN
      RAISE EXCEPTION 'لا يمكن تغيير نوع الإرسالية بعد الإصدار';
    END IF;
    IF OLD.status = 'converted' AND NEW.status <> 'converted' THEN
      IF NOT (NEW.status = 'issued'
              AND COALESCE(current_setting('app.dn_release', true),'') = 'on') THEN
        RAISE EXCEPTION 'لا يمكن تغيير حالة إرسالية محوّلة لفاتورة. ألغِ الفاتورة المرتبطة بدلاً من ذلك.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- عند إلغاء أو حذف الفاتورة المحوّلة: البضاعة ما زالت مسلّمة، فترجع الإرسالية «صادرة»
-- (بدون أي حركة مخزون) وتصبح قابلة للتحويل من جديد.
CREATE OR REPLACE FUNCTION public.release_delivery_note_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invoices%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN v_inv := OLD; ELSE v_inv := NEW; END IF;
  IF v_inv.source_delivery_note_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT (NEW.status IN ('cancelled','void','voided')) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.dn_release', 'on', true);
  UPDATE public.delivery_notes
     SET status = 'issued', linked_invoice_id = NULL, invoice_number = NULL, converted_at = NULL
   WHERE id = v_inv.source_delivery_note_id
     AND linked_invoice_id = v_inv.id
     AND status = 'converted';
  PERFORM set_config('app.dn_release', '', true);

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS trg_95_invoice_release_delivery_note ON public.invoices;
CREATE TRIGGER trg_95_invoice_release_delivery_note
AFTER UPDATE OF status ON public.invoices
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.release_delivery_note_from_invoice();

DROP TRIGGER IF EXISTS trg_05_invoice_release_delivery_note_del ON public.invoices;
CREATE TRIGGER trg_05_invoice_release_delivery_note_del
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.release_delivery_note_from_invoice();