
-- ============ production_formulas ============
CREATE TABLE public.production_formulas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  output_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  output_quantity NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prod_formulas_user ON public.production_formulas(user_id) WHERE is_deleted = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_formulas TO authenticated;
GRANT ALL ON public.production_formulas TO service_role;
ALTER TABLE public.production_formulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own formulas" ON public.production_formulas FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ production_formula_items ============
CREATE TABLE public.production_formula_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  formula_id UUID NOT NULL REFERENCES public.production_formulas(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pfi_formula ON public.production_formula_items(formula_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_formula_items TO authenticated;
GRANT ALL ON public.production_formula_items TO service_role;
ALTER TABLE public.production_formula_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own formula items" ON public.production_formula_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.production_formulas f WHERE f.id = formula_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.production_formulas f WHERE f.id = formula_id AND f.user_id = auth.uid()));

-- ============ production_orders ============
CREATE TABLE public.production_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_number TEXT,
  formula_id UUID NOT NULL REFERENCES public.production_formulas(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  posted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prod_orders_user ON public.production_orders(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_orders TO authenticated;
GRANT ALL ON public.production_orders TO service_role;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own production orders" ON public.production_orders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_prod_formulas_touch BEFORE UPDATE ON public.production_formulas
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TRIGGER trg_prod_orders_touch BEFORE UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ RPC: execute_production_order ============
CREATE OR REPLACE FUNCTION public.execute_production_order(_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.production_orders;
  fml public.production_formulas;
  itm RECORD;
  v_multiplier NUMERIC(14,6);
  v_moves INT := 0;
BEGIN
  SELECT * INTO ord FROM public.production_orders WHERE id = _order_id AND user_id = auth.uid();
  IF ord IS NULL THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  IF ord.status <> 'draft' THEN RAISE EXCEPTION 'Order already %', ord.status; END IF;

  SELECT * INTO fml FROM public.production_formulas WHERE id = ord.formula_id;
  IF fml IS NULL THEN RAISE EXCEPTION 'Formula missing'; END IF;

  v_multiplier := ord.quantity / NULLIF(fml.output_quantity,0);

  -- Consume raw materials
  FOR itm IN SELECT * FROM public.production_formula_items WHERE formula_id = fml.id LOOP
    INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_id, notes)
    VALUES (ord.user_id, itm.product_id, 'صادر', (itm.quantity * v_multiplier)::numeric(12,2), ord.warehouse_id, 'production_order_consume', ord.id, 'استهلاك مادة خام - أمر إنتاج');
    v_moves := v_moves + 1;
  END LOOP;

  -- Produce output
  INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_id, notes)
  VALUES (ord.user_id, fml.output_product_id, 'وارد', ord.quantity::numeric(12,2), ord.warehouse_id, 'production_order_output', ord.id, 'إنتاج منتج نهائي - أمر إنتاج');
  v_moves := v_moves + 1;

  UPDATE public.production_orders
    SET status='posted', posted_at=now(), updated_at=now()
    WHERE id = ord.id;

  RETURN jsonb_build_object('ok', true, 'moves', v_moves, 'output_qty', ord.quantity);
END;$$;

GRANT EXECUTE ON FUNCTION public.execute_production_order(UUID) TO authenticated;
