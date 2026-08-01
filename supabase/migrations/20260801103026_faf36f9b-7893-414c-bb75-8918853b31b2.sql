ALTER TABLE public.inventory_catalog_items ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Accountants can update catalog prices" ON public.inventory_catalog_items;
CREATE POLICY "Accountants can update catalog prices"
ON public.inventory_catalog_items
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'accountant_senior'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'accountant_senior'::app_role) OR has_role(auth.uid(), 'hr_manager'::app_role));

GRANT SELECT, UPDATE ON public.inventory_catalog_items TO authenticated;
GRANT ALL ON public.inventory_catalog_items TO service_role;