
-- ============================================================================
-- Phase 1: Production Module Foundation + Critical Inventory Fix
-- ============================================================================

-- 1) Extend products with manufacturing metadata --------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'finished'
    CHECK (product_type IN ('raw','wip','finished','service','sub_assembly')),
  ADD COLUMN IF NOT EXISTS is_manufactured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_cost NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS average_cost NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS default_bom_id UUID;

-- 2) Extend production_formulas --------------------------------------------------
ALTER TABLE public.production_formulas
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','archived')),
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS expected_yield_pct NUMERIC(6,3) NOT NULL DEFAULT 100 CHECK (expected_yield_pct > 0 AND expected_yield_pct <= 100),
  ADD COLUMN IF NOT EXISTS labor_cost_per_batch NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_cost_per_batch NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overhead_rate_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bom_level INT NOT NULL DEFAULT 0;

-- 3) Extend production_formula_items --------------------------------------------
ALTER TABLE public.production_formula_items
  ADD COLUMN IF NOT EXISTS scrap_pct NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 100),
  ADD COLUMN IF NOT EXISTS is_sub_assembly BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sequence INT NOT NULL DEFAULT 1;

-- 4) New: production_formula_byproducts -----------------------------------------
CREATE TABLE IF NOT EXISTS public.production_formula_byproducts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id UUID NOT NULL REFERENCES public.production_formulas(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_formula_byproducts TO authenticated;
GRANT ALL ON public.production_formula_byproducts TO service_role;
ALTER TABLE public.production_formula_byproducts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own byproducts" ON public.production_formula_byproducts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.production_formulas f WHERE f.id = formula_id AND f.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.production_formulas f WHERE f.id = formula_id AND f.user_id = auth.uid())
  );

-- 5) Extend production_orders (lifecycle + costs) --------------------------------
ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_status_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('draft','approved','released','in_progress','completed','closed','cancelled','posted'));

ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS actual_quantity NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS scrap_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lot_number TEXT,
  ADD COLUMN IF NOT EXISTS production_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS raw_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS output_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_material_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_labor_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_overhead_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS variance_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS posted_by UUID;

-- 6) New: production_order_items (snapshot from formula at release) -------------
CREATE TABLE IF NOT EXISTS public.production_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  planned_quantity NUMERIC(14,4) NOT NULL,
  actual_quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  scrap_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  sequence INT NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_order_items_order ON public.production_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_prod_order_items_product ON public.production_order_items(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_order_items TO authenticated;
GRANT ALL ON public.production_order_items TO service_role;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own order items" ON public.production_order_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

-- 7) New: production_costs (detailed breakdown per order) -----------------------
CREATE TABLE IF NOT EXISTS public.production_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('material','labor','overhead','variance','byproduct_credit')),
  amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantity NUMERIC(14,4),
  reference_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_costs_order ON public.production_costs(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_costs TO authenticated;
GRANT ALL ON public.production_costs TO service_role;
ALTER TABLE public.production_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own production costs" ON public.production_costs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.production_orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

-- 8) CRITICAL FIX: Auto-update products.quantity from stock_movements -----------
CREATE OR REPLACE FUNCTION public.tg_sync_product_qty_from_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.movement_type = 'وارد' THEN
      v_delta := NEW.quantity;
    ELSIF NEW.movement_type = 'صادر' THEN
      v_delta := -NEW.quantity;
    ELSE
      v_delta := NEW.quantity;  -- manual adjustment: signed
    END IF;
    UPDATE public.products SET quantity = COALESCE(quantity,0) + v_delta, updated_at = now()
      WHERE id = NEW.product_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.movement_type = 'وارد' THEN
      v_delta := -OLD.quantity;
    ELSIF OLD.movement_type = 'صادر' THEN
      v_delta := OLD.quantity;
    ELSE
      v_delta := -OLD.quantity;
    END IF;
    UPDATE public.products SET quantity = COALESCE(quantity,0) + v_delta, updated_at = now()
      WHERE id = OLD.product_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_qty ON public.stock_movements;
CREATE TRIGGER trg_sync_product_qty
  AFTER INSERT OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_product_qty_from_stock_movement();

-- 9) Helper: calculate standard cost of a formula --------------------------------
CREATE OR REPLACE FUNCTION public.calculate_formula_standard_cost(_formula_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_material NUMERIC := 0;
  v_labor    NUMERIC := 0;
  v_overhead NUMERIC := 0;
  fml public.production_formulas;
BEGIN
  SELECT * INTO fml FROM public.production_formulas WHERE id = _formula_id;
  IF fml IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(
    i.quantity * (1 + i.scrap_pct/100.0) * COALESCE(p.standard_cost, p.average_cost, p.buy_price, 0)
  ),0) INTO v_material
  FROM public.production_formula_items i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.formula_id = _formula_id;

  v_labor    := COALESCE(fml.labor_cost_per_batch, 0);
  v_overhead := COALESCE(fml.overhead_cost_per_batch, 0)
              + (v_material * COALESCE(fml.overhead_rate_pct, 0) / 100.0);

  RETURN v_material + v_labor + v_overhead;
END;
$$;
