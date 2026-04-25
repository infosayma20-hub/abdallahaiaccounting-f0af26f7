-- Drop legacy trigger / function (not needed anymore)
DROP TRIGGER IF EXISTS trg_return_stock_movement ON public.invoice_items;
DROP FUNCTION IF EXISTS public.handle_return_stock_movement();

-- Seed 4150 for users that don't have it
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active, is_system, is_system_protected, display_order)
SELECT DISTINCT a.user_id, '4150', 'مردودات المبيعات', 'إيرادات', '4100', 'credit', true, true, true, 4150
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts x WHERE x.user_id = a.user_id AND x.account_code = '4150'
);

-- Seed 5160 for users that don't have it
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, is_active, is_system, is_system_protected, display_order)
SELECT DISTINCT a.user_id, '5160', 'مردودات المشتريات', 'مصروفات', '5110', 'debit', true, true, true, 5160
FROM public.accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts x WHERE x.user_id = a.user_id AND x.account_code = '5160'
);

-- Move ONLY rows wrongly created as 5150 = "مردودات المشتريات" to 5160,
-- but only if 5160 does not already exist for that user (to avoid PK clash).
UPDATE public.accounts a
SET account_code = '5160', display_order = 5160
WHERE a.account_code = '5150'
  AND a.account_name = 'مردودات المشتريات'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts b
    WHERE b.user_id = a.user_id AND b.account_code = '5160'
  );

-- For users who already had 5160, just delete the duplicate 5150 row
-- (5160 already exists, so the misplaced 5150 entry is redundant).
DELETE FROM public.accounts a
WHERE a.account_code = '5150'
  AND a.account_name = 'مردودات المشتريات'
  AND EXISTS (
    SELECT 1 FROM public.accounts b
    WHERE b.user_id = a.user_id AND b.account_code = '5160' AND b.account_name = 'مردودات المشتريات'
  );

-- Update helper to use 5160
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
  VALUES (p_user_id, '5160', 'مردودات المشتريات', 'مصروفات', '5110', 'debit', true, true, true, 5160)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Recreate view with security_invoker
DROP VIEW IF EXISTS public.invoice_items_returnable;
CREATE VIEW public.invoice_items_returnable
WITH (security_invoker = true)
AS
SELECT
  ii.id AS invoice_item_id,
  ii.invoice_id,
  i.invoice_type,
  i.user_id,
  ii.product_id,
  ii.description,
  ii.quantity AS original_quantity,
  COALESCE((
    SELECT SUM(ri.quantity)
    FROM public.return_items ri
    JOIN public.returns r ON r.id = ri.return_id
    WHERE ri.source_invoice_item_id = ii.id
      AND r.status = 'confirmed'
      AND r.is_deleted = false
  ), 0) AS returned_quantity,
  GREATEST(
    ii.quantity - COALESCE((
      SELECT SUM(ri.quantity)
      FROM public.return_items ri
      JOIN public.returns r ON r.id = ri.return_id
      WHERE ri.source_invoice_item_id = ii.id
        AND r.status = 'confirmed'
        AND r.is_deleted = false
    ), 0),
    0
  ) AS remaining_returnable_quantity,
  ii.unit_price,
  ii.tax_rate
FROM public.invoice_items ii
JOIN public.invoices i ON i.id = ii.invoice_id;