-- ============ المرحلة 1: مشغّل الكفالات المكرر ============
DROP TRIGGER IF EXISTS trg_auto_create_warranty_cards_insert ON public.invoices;

-- تثبيت الحارس داخل الدالة (تبقى موجودة للتراجع، لكن آمنة الآن)
CREATE OR REPLACE FUNCTION public.auto_create_warranty_cards_on_invoice_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_policy RECORD;
  v_qty INTEGER;
  i INTEGER;
BEGIN
  IF NEW.invoice_type = 'sale' AND NEW.status IN ('sent','paid','posted') THEN
    FOR v_item IN
      SELECT ii.id AS item_id, ii.product_id, ii.quantity
      FROM public.invoice_items ii
      WHERE ii.invoice_id = NEW.id
    LOOP
      SELECT * INTO v_policy FROM public.warranty_policies
      WHERE product_id = v_item.product_id AND user_id = NEW.user_id AND is_active = true LIMIT 1;
      IF NOT FOUND THEN CONTINUE; END IF;

      -- حارس منع التكرار (كان ناقصاً في هذه النسخة)
      IF EXISTS (
        SELECT 1 FROM public.warranty_cards WHERE invoice_item_id = v_item.item_id
      ) THEN CONTINUE; END IF;

      IF COALESCE(v_policy.has_serial, false) = true THEN CONTINUE; END IF;
      v_qty := GREATEST(1, COALESCE(v_item.quantity, 1)::INTEGER);
      FOR i IN 1..v_qty LOOP
        INSERT INTO public.warranty_cards (
          user_id, invoice_id, invoice_item_id, product_id, contact_id,
          start_date, end_date, quantity, status
        ) VALUES (
          NEW.user_id, NEW.id, v_item.item_id, v_item.product_id, NEW.contact_id,
          COALESCE(NEW.invoice_date, CURRENT_DATE),
          COALESCE(NEW.invoice_date, CURRENT_DATE) + (v_policy.duration_months || ' months')::INTERVAL,
          1, 'active'
        );
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============ المرحلة 3: ترتيب أسماء المشغّلات ============
ALTER TRIGGER trg_auto_tag_invoice_van_warehouse      ON public.invoices RENAME TO trg_10_invoice_van_warehouse;
ALTER TRIGGER trg_scope_invoices                      ON public.invoices RENAME TO trg_20_invoice_warehouse_scope;
ALTER TRIGGER trg_guard_rep_invoice                   ON public.invoices RENAME TO trg_30_invoice_guard_rep;
ALTER TRIGGER trg_generate_invoice_number             ON public.invoices RENAME TO trg_40_invoice_number;
ALTER TRIGGER trg_invoices_feature_perm               ON public.invoices RENAME TO trg_50_invoice_feature_perm;
ALTER TRIGGER trg_invoice_tax_ledger                  ON public.invoices RENAME TO trg_60_invoice_tax_ledger;
ALTER TRIGGER trg_auto_create_warranty_cards          ON public.invoices RENAME TO trg_70_invoice_warranty_cards;
ALTER TRIGGER trg_invoice_warehouse_relocate_movements ON public.invoices RENAME TO trg_80_invoice_warehouse_relocate;
ALTER TRIGGER trg_cascade_invoice_cancel              ON public.invoices RENAME TO trg_90_invoice_cancel_cascade;