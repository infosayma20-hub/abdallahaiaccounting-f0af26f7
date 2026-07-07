
-- ============= Extend products table =============
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS print_name TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS original_number TEXT,
  ADD COLUMN IF NOT EXISTS factory_number TEXT,
  ADD COLUMN IF NOT EXISTS is_hazardous BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active' CHECK (lifecycle_status IN ('active','discontinued','will_stop','replaced')),
  ADD COLUMN IF NOT EXISTS will_stop_date DATE,
  ADD COLUMN IF NOT EXISTS replaced_by_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS launch_date DATE,
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS min_order_qty NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_purchase_price NUMERIC,
  ADD COLUMN IF NOT EXISTS sales_commission_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_commission_fixed NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_discount_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_price NUMERIC,
  ADD COLUMN IF NOT EXISTS has_expiry BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_shelf_life_days INTEGER,
  ADD COLUMN IF NOT EXISTS expiry_reminder_days INTEGER,
  ADD COLUMN IF NOT EXISTS length NUMERIC,
  ADD COLUMN IF NOT EXISTS width NUMERIC,
  ADD COLUMN IF NOT EXISTS height NUMERIC,
  ADD COLUMN IF NOT EXISTS net_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS gross_weight NUMERIC,
  ADD COLUMN IF NOT EXISTS volume NUMERIC,
  ADD COLUMN IF NOT EXISTS valuation_method TEXT DEFAULT 'weighted_avg' CHECK (valuation_method IN ('weighted_avg','fifo','standard')),
  ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS revenue_account_id UUID,
  ADD COLUMN IF NOT EXISTS cost_account_id UUID,
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID,
  ADD COLUMN IF NOT EXISTS tax_category_id UUID,
  ADD COLUMN IF NOT EXISTS is_tax_exempt BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_to_ecommerce BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS standard_production_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS production_yield_pct NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS tags TEXT[];

-- ============= product_units =============
CREATE TABLE IF NOT EXISTS public.product_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  unit_name TEXT NOT NULL,
  conversion_factor NUMERIC NOT NULL DEFAULT 1,
  is_sale BOOLEAN DEFAULT true,
  is_purchase BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  barcode TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_units_product ON public.product_units(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO service_role;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own product units" ON public.product_units
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============= product_barcodes =============
CREATE TABLE IF NOT EXISTS public.product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  barcode TEXT NOT NULL,
  unit_id UUID REFERENCES public.product_units(id) ON DELETE SET NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_product ON public.product_barcodes(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT ALL ON public.product_barcodes TO service_role;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own product barcodes" ON public.product_barcodes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============= product_price_tiers =============
CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tier_name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  min_price NUMERIC,
  max_price NUMERIC,
  currency TEXT DEFAULT 'ILS',
  min_qty NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_price_tiers_product ON public.product_price_tiers(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_tiers TO authenticated;
GRANT ALL ON public.product_price_tiers TO service_role;
ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own product price tiers" ON public.product_price_tiers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============= product_warehouse_settings =============
CREATE TABLE IF NOT EXISTS public.product_warehouse_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  opening_qty NUMERIC DEFAULT 0,
  min_qty NUMERIC DEFAULT 0,
  reorder_qty NUMERIC DEFAULT 0,
  max_qty NUMERIC,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_pws_product ON public.product_warehouse_settings(product_id);
CREATE INDEX IF NOT EXISTS idx_pws_warehouse ON public.product_warehouse_settings(warehouse_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_warehouse_settings TO authenticated;
GRANT ALL ON public.product_warehouse_settings TO service_role;
ALTER TABLE public.product_warehouse_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own product warehouse settings" ON public.product_warehouse_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============= updated_at triggers =============
CREATE TRIGGER trg_product_units_updated_at BEFORE UPDATE ON public.product_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_product_barcodes_updated_at BEFORE UPDATE ON public.product_barcodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_product_price_tiers_updated_at BEFORE UPDATE ON public.product_price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pws_updated_at BEFORE UPDATE ON public.product_warehouse_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= Ensure only one default barcode per product =============
CREATE OR REPLACE FUNCTION public.ensure_single_default_barcode()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.product_barcodes
       SET is_default = false
     WHERE product_id = NEW.product_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_single_default_barcode
  AFTER INSERT OR UPDATE OF is_default ON public.product_barcodes
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.ensure_single_default_barcode();

-- ============= Ensure only one default unit per product =============
CREATE OR REPLACE FUNCTION public.ensure_single_default_unit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.product_units
       SET is_default = false
     WHERE product_id = NEW.product_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_single_default_unit
  AFTER INSERT OR UPDATE OF is_default ON public.product_units
  FOR EACH ROW WHEN (NEW.is_default = true)
  EXECUTE FUNCTION public.ensure_single_default_unit();
