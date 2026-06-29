CREATE TABLE public.inventory_catalog_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_key TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_key, category, item_name)
);

CREATE INDEX idx_inventory_catalog_branch ON public.inventory_catalog_items(branch_key, is_active, sort_order);

GRANT SELECT ON public.inventory_catalog_items TO authenticated;
GRANT ALL ON public.inventory_catalog_items TO service_role;

ALTER TABLE public.inventory_catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read catalog"
ON public.inventory_catalog_items FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins manage catalog"
ON public.inventory_catalog_items FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.update_inventory_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_inventory_catalog_updated_at
BEFORE UPDATE ON public.inventory_catalog_items
FOR EACH ROW EXECUTE FUNCTION public.update_inventory_catalog_updated_at();