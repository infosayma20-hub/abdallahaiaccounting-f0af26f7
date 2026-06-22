
-- إصلاح RPC: لا تسمح إلا بحالة issued
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

  v_year := EXTRACT(YEAR FROM NOW())::int;
  v_seq := public.next_doc_number(v_note.user_id, 'invoice', v_year);
  v_invoice_number := 'INV-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');

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

  INSERT INTO public.invoice_items (
    invoice_id, product_id, product_name, quantity, unit_price, total, sort_order, unit
  )
  SELECT v_invoice_id, product_id, product_name, quantity, unit_price, total, sort_order, unit
  FROM public.delivery_note_items
  WHERE delivery_note_id = v_note.id;

  UPDATE public.delivery_notes
  SET status = 'converted',
      linked_invoice_id = v_invoice_id,
      invoice_number = v_invoice_number,
      converted_at = now()
  WHERE id = v_note.id;

  RETURN v_invoice_id;
END;
$function$;

-- إصلاح حماية: منع إلغاء إرسالية محوّلة لفاتورة
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
    -- لا تراجع من converted نهائياً (حتى للإلغاء — يجب إلغاء الفاتورة المرتبطة بدلاً من ذلك)
    IF OLD.status = 'converted' AND NEW.status <> 'converted' THEN
      RAISE EXCEPTION 'لا يمكن تغيير حالة إرسالية محوّلة لفاتورة. ألغِ الفاتورة المرتبطة بدلاً من ذلك.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
