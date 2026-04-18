
-- ============================================
-- Phase 2: Stock Transfer Vouchers
-- ============================================

-- 1. Main stock_transfers table
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transfer_number TEXT NOT NULL,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transfer_type TEXT NOT NULL DEFAULT 'transfer'
    CHECK (transfer_type IN ('load_van', 'return_van', 'transfer', 'adjustment')),
  from_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  sales_rep_id UUID REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  total_items INTEGER NOT NULL DEFAULT 0,
  total_quantity NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancel_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, transfer_number)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_user ON public.stock_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON public.stock_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON public.stock_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_rep ON public.stock_transfers(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_date ON public.stock_transfers(transfer_date DESC);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own stock transfers"
  ON public.stock_transfers FOR SELECT
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users insert own stock transfers"
  ON public.stock_transfers FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users update own stock transfers"
  ON public.stock_transfers FOR UPDATE
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users delete own stock transfers"
  ON public.stock_transfers FOR DELETE
  USING (public.is_team_member(auth.uid(), user_id));

-- 2. Items table
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product ON public.stock_transfer_items(product_id);

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transfer items"
  ON public.stock_transfer_items FOR SELECT
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users insert own transfer items"
  ON public.stock_transfer_items FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users update own transfer items"
  ON public.stock_transfer_items FOR UPDATE
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users delete own transfer items"
  ON public.stock_transfer_items FOR DELETE
  USING (public.is_team_member(auth.uid(), user_id));

-- 3. Auto-numbering
CREATE OR REPLACE FUNCTION public.generate_stock_transfer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.transfer_number IS NOT NULL AND NEW.transfer_number != '' THEN
    RETURN NEW;
  END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.stock_transfers
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.transfer_number := 'TR-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_transfer_number
  BEFORE INSERT ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.generate_stock_transfer_number();

-- 4. updated_at trigger
CREATE TRIGGER trg_stock_transfers_updated_at
  BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_warehouse_updated_at();

-- 5. Confirm transfer → create stock_movements (OUT from source + IN to destination)
CREATE OR REPLACE FUNCTION public.confirm_stock_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_total_items INTEGER := 0;
  v_total_qty NUMERIC := 0;
  v_total_val NUMERIC := 0;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'السند غير موجود');
  END IF;
  IF v_transfer.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'السند ليس مسودة');
  END IF;
  IF v_transfer.from_warehouse_id IS NULL OR v_transfer.to_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تحديد مستودعي المصدر والوجهة');
  END IF;
  IF v_transfer.from_warehouse_id = v_transfer.to_warehouse_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن التحويل لنفس المستودع');
  END IF;

  -- Loop items: create OUT + IN movements
  FOR v_item IN
    SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- Outgoing from source warehouse
    INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)
    VALUES (
      v_transfer.user_id, v_item.product_id, 'صادر'::stock_movement_type, v_item.quantity,
      v_transfer.from_warehouse_id,
      'تحويل ' || v_transfer.transfer_number
    );
    -- Incoming to destination warehouse
    INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)
    VALUES (
      v_transfer.user_id, v_item.product_id, 'وارد'::stock_movement_type, v_item.quantity,
      v_transfer.to_warehouse_id,
      'تحويل ' || v_transfer.transfer_number
    );
    v_total_items := v_total_items + 1;
    v_total_qty := v_total_qty + v_item.quantity;
    v_total_val := v_total_val + COALESCE(v_item.line_total, 0);
  END LOOP;

  IF v_total_items = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا توجد بنود في السند');
  END IF;

  UPDATE public.stock_transfers SET
    status = 'confirmed',
    confirmed_at = now(),
    confirmed_by = auth.uid(),
    total_items = v_total_items,
    total_quantity = v_total_qty,
    total_value = v_total_val
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'movements_created', v_total_items * 2);
END;
$$;

-- 6. Cancel confirmed transfer → reverse the movements
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
BEGIN
  SELECT * INTO v_transfer FROM public.stock_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'السند غير موجود');
  END IF;
  IF v_transfer.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'السند ملغى مسبقاً');
  END IF;

  -- If was confirmed: create reverse movements
  IF v_transfer.status = 'confirmed' THEN
    FOR v_item IN
      SELECT * FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id
    LOOP
      -- Reverse: IN to source
      INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)
      VALUES (
        v_transfer.user_id, v_item.product_id, 'وارد'::stock_movement_type, v_item.quantity,
        v_transfer.from_warehouse_id,
        'إلغاء تحويل ' || v_transfer.transfer_number
      );
      -- Reverse: OUT from destination
      INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)
      VALUES (
        v_transfer.user_id, v_item.product_id, 'صادر'::stock_movement_type, v_item.quantity,
        v_transfer.to_warehouse_id,
        'إلغاء تحويل ' || v_transfer.transfer_number
      );
    END LOOP;
  END IF;

  UPDATE public.stock_transfers SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancel_reason = p_reason
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id);
END;
$$;
