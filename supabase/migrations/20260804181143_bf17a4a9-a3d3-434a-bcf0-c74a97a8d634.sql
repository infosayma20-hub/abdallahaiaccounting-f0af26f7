-- 1) Tenant-scoped line attribute options (fabric types, etc.)
CREATE TABLE public.product_attribute_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attribute_key text NOT NULL DEFAULT 'fabric',
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, attribute_key, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attribute_options TO authenticated;
GRANT ALL ON public.product_attribute_options TO service_role;
ALTER TABLE public.product_attribute_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages attribute options"
ON public.product_attribute_options FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team can view attribute options"
ON public.product_attribute_options FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE TRIGGER trg_product_attribute_options_updated_at
BEFORE UPDATE ON public.product_attribute_options
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Fabric attribute on line items (nullable, additive)
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS fabric text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS fabric text;

-- 3) Supplier item aliases -> existing products
CREATE TABLE public.product_supplier_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid,
  supplier_name text,
  alias_name text NOT NULL,
  alias_code text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, supplier_id, alias_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_supplier_aliases TO authenticated;
GRANT ALL ON public.product_supplier_aliases TO service_role;
ALTER TABLE public.product_supplier_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages supplier aliases"
ON public.product_supplier_aliases FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Team can view supplier aliases"
ON public.product_supplier_aliases FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE INDEX idx_supplier_aliases_lookup ON public.product_supplier_aliases (user_id, alias_name);

CREATE TRIGGER trg_product_supplier_aliases_updated_at
BEFORE UPDATE ON public.product_supplier_aliases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();