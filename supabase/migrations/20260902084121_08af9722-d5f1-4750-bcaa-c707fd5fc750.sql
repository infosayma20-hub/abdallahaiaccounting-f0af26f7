
-- INVOICES: team insert/update
DROP POLICY IF EXISTS "Team can insert invoices" ON public.invoices;
CREATE POLICY "Team can insert invoices" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  public.is_team_member(auth.uid(), user_id)
  AND public.user_can_access(auth.uid(), 'invoices')
  AND (
    CASE WHEN invoice_type = 'purchase'
      THEN public.accountant_perm('can_create_purchase_invoice')
      ELSE public.accountant_perm('can_create_sale_invoice')
    END
  )
);

DROP POLICY IF EXISTS "Team can update invoices" ON public.invoices;
CREATE POLICY "Team can update invoices" ON public.invoices
FOR UPDATE TO authenticated
USING (
  public.is_team_member(auth.uid(), user_id)
  AND public.user_can_access(auth.uid(), 'invoices')
  AND public.accountant_perm('can_edit_invoices')
)
WITH CHECK (
  public.is_team_member(auth.uid(), user_id)
  AND public.user_can_access(auth.uid(), 'invoices')
  AND public.accountant_perm('can_edit_invoices')
);

-- INVOICE ITEMS: follow parent invoice ownership
DROP POLICY IF EXISTS "Team can insert invoice items" ON public.invoice_items;
CREATE POLICY "Team can insert invoice items" ON public.invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_team_member(auth.uid(), i.user_id)
  )
);

DROP POLICY IF EXISTS "Team can update invoice items" ON public.invoice_items;
CREATE POLICY "Team can update invoice items" ON public.invoice_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_team_member(auth.uid(), i.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_team_member(auth.uid(), i.user_id)
  )
);

DROP POLICY IF EXISTS "Team can delete invoice items" ON public.invoice_items;
CREATE POLICY "Team can delete invoice items" ON public.invoice_items
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND public.is_team_member(auth.uid(), i.user_id)
  )
);

-- STOCK MOVEMENTS: team members of the data owner
DROP POLICY IF EXISTS "Team can insert stock movements" ON public.stock_movements;
CREATE POLICY "Team can insert stock movements" ON public.stock_movements
FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id));

DROP POLICY IF EXISTS "Team can view stock movements" ON public.stock_movements;
CREATE POLICY "Team can view stock movements" ON public.stock_movements
FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

-- INVOICE ACTIVITY LOG
DROP POLICY IF EXISTS "Team can manage invoice activity" ON public.invoice_activity_log;
CREATE POLICY "Team can manage invoice activity" ON public.invoice_activity_log
FOR ALL TO authenticated
USING (public.is_team_member(auth.uid(), user_id))
WITH CHECK (public.is_team_member(auth.uid(), user_id));
