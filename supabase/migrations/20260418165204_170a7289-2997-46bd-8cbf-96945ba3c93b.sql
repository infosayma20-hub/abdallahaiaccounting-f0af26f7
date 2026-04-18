-- Auto-tag invoices with warehouse_id when the user has an open van day
CREATE OR REPLACE FUNCTION public.auto_tag_invoice_van_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse_id UUID;
BEGIN
  -- Skip if already set or invoice is not a sale
  IF NEW.warehouse_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.invoice_type, 'sale') NOT IN ('sale', 'invoice') THEN
    RETURN NEW;
  END IF;

  -- Find the open van day for this user
  SELECT warehouse_id INTO v_warehouse_id
  FROM public.van_sales_days
  WHERE user_id = NEW.user_id
    AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    NEW.warehouse_id := v_warehouse_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_invoice_van_warehouse ON public.invoices;
CREATE TRIGGER trg_auto_tag_invoice_van_warehouse
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_tag_invoice_van_warehouse();