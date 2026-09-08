-- invoices: SELECT (sales rep)
DROP POLICY IF EXISTS "Sales rep can view own invoices" ON public.invoices;
CREATE POLICY "Sales rep can view own invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  (SELECT is_sales_rep())
  AND user_id = (SELECT get_rep_owner_id())
  AND warehouse_id = (SELECT get_rep_warehouse_id())
);

-- invoices: INSERT (sales rep)
DROP POLICY IF EXISTS "Sales rep can create invoices" ON public.invoices;
CREATE POLICY "Sales rep can create invoices" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT is_sales_rep())
  AND user_id = (SELECT get_rep_owner_id())
  AND warehouse_id = (SELECT get_rep_warehouse_id())
);

-- invoices: INSERT (team)
DROP POLICY IF EXISTS "Team can insert invoices" ON public.invoices;
CREATE POLICY "Team can insert invoices" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  is_team_member((SELECT auth.uid()), user_id)
  AND (SELECT user_can_access((SELECT auth.uid()), 'invoices'))
  AND CASE
        WHEN invoice_type = 'purchase' THEN (SELECT accountant_perm('can_create_purchase_invoice'))
        ELSE (SELECT accountant_perm('can_create_sale_invoice'))
      END
);

-- invoices: UPDATE (team)
DROP POLICY IF EXISTS "Team can update invoices" ON public.invoices;
CREATE POLICY "Team can update invoices" ON public.invoices
FOR UPDATE TO authenticated
USING (
  is_team_member((SELECT auth.uid()), user_id)
  AND (SELECT user_can_access((SELECT auth.uid()), 'invoices'))
  AND (SELECT accountant_perm('can_edit_invoices'))
)
WITH CHECK (
  is_team_member((SELECT auth.uid()), user_id)
  AND (SELECT user_can_access((SELECT auth.uid()), 'invoices'))
  AND (SELECT accountant_perm('can_edit_invoices'))
);

-- invoice_items: SELECT (sales rep)
DROP POLICY IF EXISTS "Sales rep can view invoice items" ON public.invoice_items;
CREATE POLICY "Sales rep can view invoice items" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  (SELECT is_sales_rep())
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.user_id = (SELECT get_rep_owner_id())
      AND i.warehouse_id = (SELECT get_rep_warehouse_id())
  )
);

-- invoice_items: INSERT (sales rep)
DROP POLICY IF EXISTS "Sales rep can create invoice items" ON public.invoice_items;
CREATE POLICY "Sales rep can create invoice items" ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT is_sales_rep())
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.user_id = (SELECT get_rep_owner_id())
      AND i.warehouse_id = (SELECT get_rep_warehouse_id())
  )
);

-- product_warehouse_balances: SELECT
DROP POLICY IF EXISTS "pwb_select_own" ON public.product_warehouse_balances;
CREATE POLICY "pwb_select_own" ON public.product_warehouse_balances
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR user_id = (SELECT get_team_owner_id())
);