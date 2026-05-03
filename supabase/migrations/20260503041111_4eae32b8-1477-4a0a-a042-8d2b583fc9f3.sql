
UPDATE public.warehouses
SET name = 'مستودع سيارة مرسيدس', updated_at = now()
WHERE id = '688eb528-2eda-4c66-ab4e-b53d7ca755d8'
  AND user_id = '6fb346d9-f8a6-44a7-a99c-fd2b440f6060';

UPDATE public.contacts
SET contact_type = 'عميل ومورد', updated_at = now()
WHERE id = '99b55b34-5e37-4c4a-a87a-0f20125233b7';

INSERT INTO public.contacts (user_id, contact_name, contact_type, is_active)
SELECT '6fb346d9-f8a6-44a7-a99c-fd2b440f6060', 'مورد الشركة', 'مورد', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.contacts
  WHERE user_id='6fb346d9-f8a6-44a7-a99c-fd2b440f6060' AND contact_name='مورد الشركة'
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_supplier_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_default_supplier ON public.products(default_supplier_id);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_name text;
CREATE INDEX IF NOT EXISTS idx_invoice_items_supplier ON public.invoice_items(supplier_id);

CREATE OR REPLACE FUNCTION public.fill_invoice_item_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT p.default_supplier_id, c.contact_name
      INTO NEW.supplier_id, NEW.supplier_name
    FROM public.products p
    LEFT JOIN public.contacts c ON c.id = p.default_supplier_id
    WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_invoice_item_supplier ON public.invoice_items;
CREATE TRIGGER trg_fill_invoice_item_supplier
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_invoice_item_supplier();

CREATE OR REPLACE VIEW public.v_sales_by_supplier AS
SELECT
  i.user_id,
  ii.supplier_id,
  ii.supplier_name,
  ii.product_id,
  ii.product_name,
  COUNT(*)              AS lines_count,
  SUM(ii.quantity)      AS total_qty,
  SUM(ii.total_amount)  AS total_sales,
  SUM(COALESCE(ii.cost_price,0) * ii.quantity) AS total_cost,
  SUM(COALESCE(ii.line_profit,0))              AS total_profit,
  MIN(i.invoice_date)   AS first_sale,
  MAX(i.invoice_date)   AS last_sale
FROM public.invoice_items ii
JOIN public.invoices i ON i.id = ii.invoice_id
WHERE COALESCE(i.status, '') <> 'ملغاة'
GROUP BY i.user_id, ii.supplier_id, ii.supplier_name, ii.product_id, ii.product_name;
