-- ============================================================
-- Sales & Purchase Returns Module
-- Extends invoices table to support sales_return / purchase_return
-- with independent numbering (SR-YYYY-#### / PR-YYYY-####)
-- ============================================================

-- 1) Extend numbering trigger to recognize new types
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_year INTEGER;
  v_offset INTEGER;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    WHEN 'credit_note' THEN 'CN'
    WHEN 'debit_note' THEN 'DN'
    WHEN 'sales_return' THEN 'SR'
    WHEN 'purchase_return' THEN 'PR'
    ELSE 'DOC'
  END;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()))::INT;

  -- Per-user offset only applies to sales (legacy companies.invoice_number_offset)
  IF NEW.invoice_type = 'sale' THEN
    SELECT COALESCE(invoice_number_offset, 0) INTO v_offset
    FROM public.companies
    WHERE owner_id = NEW.user_id
    LIMIT 1;
  ELSE
    v_offset := 0;
  END IF;
  v_offset := COALESCE(v_offset, 0);

  -- Atomic increment via UPSERT (PK lock guarantees no race)
  INSERT INTO public.invoice_sequences (user_id, invoice_type, year, last_number)
  VALUES (NEW.user_id, NEW.invoice_type, v_year, v_offset + 1)
  ON CONFLICT (user_id, invoice_type, year)
  DO UPDATE SET
    last_number = invoice_sequences.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next;

  IF v_next <= v_offset THEN
    UPDATE public.invoice_sequences
       SET last_number = v_offset + 1, updated_at = now()
     WHERE user_id = NEW.user_id
       AND invoice_type = NEW.invoice_type
       AND year = v_year
    RETURNING last_number INTO v_next;
  END IF;

  NEW.invoice_number := v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

-- 2) Seed dedicated GL accounts for returns per existing user (idempotent)
-- 4150 = Sales Returns (contra-revenue), 5150 = Purchase Returns (contra-expense)
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active, is_system, is_system_protected, display_order)
SELECT DISTINCT
  i.user_id,
  '4150',
  'مردودات المبيعات',
  'إيرادات',
  '4100',
  'credit',
  true, true, true, 4150
FROM public.invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a WHERE a.user_id = i.user_id AND a.account_code = '4150'
);

INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active, is_system, is_system_protected, display_order)
SELECT DISTINCT
  i.user_id,
  '5150',
  'مردودات المشتريات',
  'مصروفات',
  '5110',
  'debit',
  true, true, true, 5150
FROM public.invoices i
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a WHERE a.user_id = i.user_id AND a.account_code = '5150'
);

-- 3) Helper: ensure return accounts exist for a given user (called by RPC)
CREATE OR REPLACE FUNCTION public.ensure_return_accounts(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active, is_system, is_system_protected, display_order)
  VALUES (p_user_id, '4150', 'مردودات المبيعات', 'إيرادات', '4100', 'credit', true, true, true, 4150)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active, is_system, is_system_protected, display_order)
  VALUES (p_user_id, '5150', 'مردودات المشتريات', 'مصروفات', '5110', 'debit', true, true, true, 5150)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_return_accounts(UUID) TO authenticated;

-- 4) After-insert trigger on returns: reverse stock movement automatically
CREATE OR REPLACE FUNCTION public.handle_return_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_movement_type TEXT;
  v_qty_delta NUMERIC;
BEGIN
  SELECT invoice_type, invoice_number, status, user_id INTO v_invoice
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF v_invoice.invoice_type NOT IN ('sales_return','purchase_return') THEN
    RETURN NEW;
  END IF;
  IF v_invoice.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sales return: stock comes back IN. Purchase return: stock goes OUT.
  IF v_invoice.invoice_type = 'sales_return' THEN
    v_movement_type := 'وارد';
    v_qty_delta := NEW.quantity;
  ELSE
    v_movement_type := 'صادر';
    v_qty_delta := -NEW.quantity;
  END IF;

  -- Update product stock
  UPDATE public.products
     SET current_stock = COALESCE(current_stock, 0) + v_qty_delta
   WHERE id = NEW.product_id AND user_id = v_invoice.user_id;

  -- Log stock movement (best-effort; table may have additional cols filled by defaults)
  BEGIN
    INSERT INTO public.stock_movements (
      user_id, product_id, movement_type, quantity,
      reference_type, reference_id, reference_note
    ) VALUES (
      v_invoice.user_id, NEW.product_id, v_movement_type, NEW.quantity,
      v_invoice.invoice_type, NEW.invoice_id,
      CASE WHEN v_invoice.invoice_type = 'sales_return'
           THEN 'مردود مبيعات ' || v_invoice.invoice_number
           ELSE 'مردود مشتريات ' || v_invoice.invoice_number END
    );
  EXCEPTION WHEN OTHERS THEN
    -- swallow; movement log is informational
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_stock_movement ON public.invoice_items;
CREATE TRIGGER trg_return_stock_movement
  AFTER INSERT ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_return_stock_movement();

-- 5) Helper view (security invoker): remaining returnable qty per invoice item
CREATE OR REPLACE VIEW public.invoice_items_returnable
WITH (security_invoker = true)
AS
SELECT
  ii.id AS item_id,
  ii.invoice_id,
  ii.product_id,
  ii.product_name,
  ii.quantity AS original_qty,
  ii.unit_price,
  COALESCE(SUM(ri.quantity), 0) AS already_returned_qty,
  GREATEST(ii.quantity - COALESCE(SUM(ri.quantity), 0), 0) AS returnable_qty
FROM public.invoice_items ii
LEFT JOIN public.invoices retinv
       ON retinv.original_invoice_id = ii.invoice_id
      AND retinv.invoice_type IN ('sales_return','purchase_return')
      AND retinv.status != 'cancelled'
LEFT JOIN public.invoice_items ri
       ON ri.invoice_id = retinv.id
      AND (
        (ri.product_id IS NOT NULL AND ri.product_id = ii.product_id)
        OR (ri.product_id IS NULL AND ii.product_id IS NULL AND ri.product_name = ii.product_name)
      )
GROUP BY ii.id, ii.invoice_id, ii.product_id, ii.product_name, ii.quantity, ii.unit_price;