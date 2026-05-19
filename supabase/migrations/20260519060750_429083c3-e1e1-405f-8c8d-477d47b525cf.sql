
-- 1) Trigger: حين تُضاف بند شراء، عبِّي default_supplier_id على المنتج إذا كان فاضي
CREATE OR REPLACE FUNCTION public.set_product_default_supplier_from_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supplier_id uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT supplier_id INTO v_supplier_id
  FROM public.purchase_invoices
  WHERE id = NEW.invoice_id;

  IF v_supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.products
     SET default_supplier_id = v_supplier_id,
         updated_at = now()
   WHERE id = NEW.product_id
     AND default_supplier_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_product_default_supplier ON public.purchase_invoice_items;
CREATE TRIGGER trg_set_product_default_supplier
AFTER INSERT ON public.purchase_invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.set_product_default_supplier_from_purchase();

-- 2) Backfill: المنتجات بدون مورد افتراضي → من أحدث فاتورة شراء
WITH latest_purchase AS (
  SELECT DISTINCT ON (pit.product_id)
    pit.product_id,
    pi.supplier_id,
    pi.invoice_date
  FROM public.purchase_invoice_items pit
  JOIN public.purchase_invoices pi ON pi.id = pit.invoice_id
  WHERE pit.product_id IS NOT NULL
    AND pi.supplier_id IS NOT NULL
  ORDER BY pit.product_id, pi.invoice_date DESC NULLS LAST, pi.created_at DESC NULLS LAST
)
UPDATE public.products p
   SET default_supplier_id = lp.supplier_id,
       updated_at = now()
  FROM latest_purchase lp
 WHERE p.id = lp.product_id
   AND p.default_supplier_id IS NULL;

-- 3) Backfill: بنود فواتير المبيعات الموجودة بدون مورد → من المورد الافتراضي للمنتج
UPDATE public.invoice_items ii
   SET supplier_id = p.default_supplier_id,
       supplier_name = c.contact_name
  FROM public.products p
  LEFT JOIN public.contacts c ON c.id = p.default_supplier_id
 WHERE ii.product_id = p.id
   AND ii.supplier_id IS NULL
   AND p.default_supplier_id IS NOT NULL;
