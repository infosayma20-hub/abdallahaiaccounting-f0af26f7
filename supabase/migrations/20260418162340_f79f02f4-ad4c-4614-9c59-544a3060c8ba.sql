-- ============================================================
-- المرحلة 1: نظام المستودعات المتعددة (Multi-Warehouse Foundation)
-- ============================================================

-- 1. جدول المستودعات
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  warehouse_type TEXT NOT NULL DEFAULT 'main',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  manager_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  sales_rep_id UUID REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  address TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, code),
  CONSTRAINT warehouses_type_check CHECK (warehouse_type IN ('main', 'branch', 'van', 'virtual'))
);

CREATE INDEX IF NOT EXISTS idx_warehouses_user ON public.warehouses(user_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_rep ON public.warehouses(sales_rep_id) WHERE sales_rep_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouses_type ON public.warehouses(user_id, warehouse_type);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own warehouses" ON public.warehouses
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- 2. ربط حركات المخزون بمستودع
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse 
  ON public.stock_movements(warehouse_id) WHERE warehouse_id IS NOT NULL;

-- 3. ربط فواتير POS بمستودع
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_orders_warehouse 
  ON public.pos_orders(warehouse_id) WHERE warehouse_id IS NOT NULL;

-- 4. ربط فواتير المبيعات/المشتريات بمستودع
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_warehouse 
  ON public.invoices(warehouse_id) WHERE warehouse_id IS NOT NULL;

-- 5. ربط البائع بمستودعه الافتراضي
ALTER TABLE public.sales_representatives
  ADD COLUMN IF NOT EXISTS default_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- 6. دالة لإنشاء مستودع افتراضي
CREATE OR REPLACE FUNCTION public.ensure_default_warehouse(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id UUID;
BEGIN
  SELECT id INTO v_warehouse_id
  FROM public.warehouses
  WHERE user_id = p_user_id AND is_default = true
  LIMIT 1;

  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.warehouses (user_id, code, name, warehouse_type, is_default)
    VALUES (p_user_id, 'WH-MAIN', 'المستودع الرئيسي', 'main', true)
    RETURNING id INTO v_warehouse_id;
  END IF;

  RETURN v_warehouse_id;
END;
$$;

-- 7. View محسوب: رصيد كل منتج في كل مستودع
-- وارد = مدخل، صادر = مخرج، تعديل يدوي = حسب الإشارة
CREATE OR REPLACE VIEW public.product_warehouse_stock
WITH (security_invoker = on) AS
SELECT
  p.user_id,
  p.id AS product_id,
  p.name AS product_name,
  p.unit,
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.warehouse_type,
  w.sales_rep_id,
  COALESCE(SUM(
    CASE 
      WHEN sm.movement_type = 'وارد' THEN sm.quantity
      WHEN sm.movement_type = 'صادر' THEN -sm.quantity
      WHEN sm.movement_type = 'تعديل يدوي' THEN sm.quantity
      ELSE 0
    END
  ), 0) AS quantity_on_hand,
  COUNT(sm.id) AS movement_count,
  MAX(sm.created_at) AS last_movement_at
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.stock_movements sm 
  ON sm.product_id = p.id 
  AND sm.warehouse_id = w.id
  AND sm.user_id = p.user_id
WHERE p.user_id = w.user_id
GROUP BY p.user_id, p.id, p.name, p.unit, w.id, w.name, w.warehouse_type, w.sales_rep_id;

-- 8. Trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION public.update_warehouse_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warehouses_updated_at ON public.warehouses;
CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_warehouse_updated_at();