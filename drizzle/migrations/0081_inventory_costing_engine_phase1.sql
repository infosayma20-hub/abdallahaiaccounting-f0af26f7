
-- =====================================================================
-- Inventory costing engine — Phase 1 (engine + settings + audit)
-- Opt-in per company (costing_engine_enabled=false by default).
-- Does NOT touch existing journals, invoices or saved costs.
-- =====================================================================

-- 1) Settings -----------------------------------------------------------
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS inventory_valuation_method text NOT NULL DEFAULT 'moving_avg',
  ADD COLUMN IF NOT EXISTS costing_engine_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS costing_effective_from timestamptz;

UPDATE public.company_settings
SET inventory_valuation_method = CASE
  WHEN inventory_system = 'periodic' AND periodic_disclosure_method = 'fifo' THEN 'fifo'
  WHEN inventory_system = 'periodic' THEN 'weighted_avg_period'
  ELSE 'moving_avg' END;

ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_valuation_method_check;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_valuation_method_check
  CHECK (inventory_valuation_method IN ('moving_avg','weighted_avg_period','fifo'));
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_valuation_combo_check;
ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_valuation_combo_check
  CHECK (
    (inventory_system = 'perpetual' AND inventory_valuation_method IN ('moving_avg','fifo'))
    OR (inventory_system = 'periodic' AND inventory_valuation_method IN ('weighted_avg_period','fifo'))
  );

-- 2) Tables -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_cost_balances (
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  user_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  avg_cost numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_icb_user ON public.inventory_cost_balances(user_id);

CREATE TABLE IF NOT EXISTS public.inventory_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  movement_id uuid,
  source text NOT NULL DEFAULT 'movement',
  received_at timestamptz NOT NULL DEFAULT now(),
  qty_in numeric NOT NULL,
  qty_remaining numeric NOT NULL,
  unit_cost numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_icl_fifo ON public.inventory_cost_layers(product_id, warehouse_id, received_at, created_at) WHERE qty_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_icl_movement ON public.inventory_cost_layers(movement_id);
CREATE INDEX IF NOT EXISTS idx_icl_user ON public.inventory_cost_layers(user_id);

CREATE TABLE IF NOT EXISTS public.inventory_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  movement_id uuid,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('opening','in','out','reversal')),
  method text NOT NULL,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  cost_source text,
  negative_stock boolean NOT NULL DEFAULT false,
  negative_variance numeric NOT NULL DEFAULT 0,
  balance_qty_after numeric NOT NULL DEFAULT 0,
  balance_value_after numeric NOT NULL DEFAULT 0,
  avg_cost_after numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  reference_line_id uuid,
  reverses_entry_id uuid,
  reversed_at timestamptz,
  movement_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ice_user_date ON public.inventory_cost_entries(user_id, movement_at);
CREATE INDEX IF NOT EXISTS idx_ice_product ON public.inventory_cost_entries(product_id, warehouse_id, movement_at);
CREATE INDEX IF NOT EXISTS idx_ice_movement ON public.inventory_cost_entries(movement_id);
CREATE INDEX IF NOT EXISTS idx_ice_ref_line ON public.inventory_cost_entries(reference_line_id);

CREATE TABLE IF NOT EXISTS public.inventory_cost_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.inventory_cost_entries(id) ON DELETE CASCADE,
  layer_id uuid NOT NULL REFERENCES public.inventory_cost_layers(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_icc_entry ON public.inventory_cost_consumptions(entry_id);
CREATE INDEX IF NOT EXISTS idx_icc_user ON public.inventory_cost_consumptions(user_id);

CREATE TABLE IF NOT EXISTS public.inventory_costing_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  changed_by uuid,
  action text NOT NULL,
  old_system text, new_system text,
  old_method text, new_method text,
  effective_from timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_icch_user ON public.inventory_costing_changes(user_id, created_at DESC);

GRANT SELECT ON public.inventory_cost_balances, public.inventory_cost_layers, public.inventory_cost_entries,
  public.inventory_cost_consumptions, public.inventory_costing_changes TO authenticated;
GRANT ALL ON public.inventory_cost_balances, public.inventory_cost_layers, public.inventory_cost_entries,
  public.inventory_cost_consumptions, public.inventory_costing_changes TO service_role;

ALTER TABLE public.inventory_cost_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_costing_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read cost balances" ON public.inventory_cost_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "tenant read cost layers" ON public.inventory_cost_layers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "tenant read cost entries" ON public.inventory_cost_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "tenant read cost consumptions" ON public.inventory_cost_consumptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));
CREATE POLICY "tenant read costing changes" ON public.inventory_costing_changes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- 3) Keep legacy columns in sync + lock method once engine is on ---------
CREATE OR REPLACE FUNCTION public.tg_company_settings_costing_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.costing_engine_enabled
     AND COALESCE(current_setting('app.costing_change', true), '') <> 'on'
     AND (NEW.inventory_system IS DISTINCT FROM OLD.inventory_system
          OR NEW.inventory_valuation_method IS DISTINCT FROM OLD.inventory_valuation_method
          OR NEW.costing_engine_enabled IS DISTINCT FROM OLD.costing_engine_enabled
          OR NEW.costing_effective_from IS DISTINCT FROM OLD.costing_effective_from) THEN
    RAISE EXCEPTION 'طريقة تقييم المخزون مقفلة بعد التفعيل؛ التغيير فقط عبر معالج تغيير الطريقة';
  END IF;
  NEW.periodic_inventory_enabled := (NEW.inventory_system = 'periodic');
  NEW.periodic_disclosure_method := CASE WHEN NEW.inventory_valuation_method = 'fifo' THEN 'fifo' ELSE 'weighted_avg' END;
  NEW.inventory_costing_method := CASE WHEN NEW.inventory_valuation_method = 'fifo' THEN 'fifo' ELSE 'weighted_avg' END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_company_settings_costing_guard ON public.company_settings;
CREATE TRIGGER trg_company_settings_costing_guard
  BEFORE INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_company_settings_costing_guard();

-- 4) Receipt unit cost resolver -----------------------------------------
CREATE OR REPLACE FUNCTION public._inv_cost_receipt_unit_cost(_mv public.stock_movements, _fallback numeric, OUT unit_cost numeric, OUT source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item record;
  v_net numeric;
  v_rate numeric;
BEGIN
  IF COALESCE(_mv.unit_cost, 0) > 0 THEN
    unit_cost := _mv.unit_cost; source := 'movement'; RETURN;
  END IF;

  IF _mv.reference_type IN ('invoice','purchase_invoice') AND _mv.reference_line_id IS NOT NULL THEN
    SELECT ii.quantity, ii.unit_price, ii.discount, ii.discount_type, i.invoice_type, i.currency, i.exchange_rate
      INTO v_item
      FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
     WHERE ii.id = _mv.reference_line_id;
    IF FOUND AND v_item.invoice_type = 'purchase' AND COALESCE(v_item.unit_price,0) > 0 THEN
      IF COALESCE(v_item.discount,0) = 0 THEN
        v_net := v_item.unit_price;
      ELSIF lower(COALESCE(v_item.discount_type,'')) IN ('percent','percentage','%','pct') THEN
        v_net := v_item.unit_price * (1 - v_item.discount / 100.0);
      ELSIF COALESCE(v_item.quantity,0) > 0 THEN
        v_net := (v_item.quantity * v_item.unit_price - v_item.discount) / v_item.quantity;
      ELSE
        v_net := v_item.unit_price;
      END IF;
      v_rate := CASE WHEN COALESCE(v_item.currency,'شيكل') IN ('شيكل','ILS','₪') THEN 1
                     ELSE NULLIF(v_item.exchange_rate,0) END;
      IF v_rate IS NOT NULL AND v_net > 0 THEN
        unit_cost := round(v_net * v_rate, 6); source := 'purchase_invoice'; RETURN;
      END IF;
    END IF;
  END IF;

  unit_cost := COALESCE(_fallback, 0); source := 'current_cost';
END $$;

-- 5) Core engine: apply one movement ------------------------------------
CREATE OR REPLACE FUNCTION public._inv_cost_apply_movement(_mv public.stock_movements, _method text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wh uuid;
  v_signed numeric;
  v_qty numeric;
  b public.inventory_cost_balances%ROWTYPE;
  v_unit numeric; v_src text; v_total numeric := 0;
  v_neg boolean := false; v_var numeric := 0;
  v_entry uuid := gen_random_uuid();
  v_need numeric; v_take numeric; v_last_cost numeric;
  l record;
  v_fallback numeric;
  v_new_qty numeric; v_new_val numeric; v_new_avg numeric;
BEGIN
  IF _mv.product_id IS NULL THEN RETURN NULL; END IF;
  v_wh := COALESCE(_mv.warehouse_id, (SELECT w.id FROM public.warehouses w WHERE w.user_id = _mv.user_id AND w.is_default LIMIT 1));
  IF v_wh IS NULL THEN RETURN NULL; END IF;
  v_signed := public.stock_movement_signed_qty(_mv.movement_type, _mv.quantity);
  IF v_signed = 0 THEN RETURN NULL; END IF;
  v_qty := abs(v_signed);

  INSERT INTO public.inventory_cost_balances(product_id, warehouse_id, user_id)
  VALUES (_mv.product_id, v_wh, _mv.user_id) ON CONFLICT DO NOTHING;
  SELECT * INTO b FROM public.inventory_cost_balances
   WHERE product_id = _mv.product_id AND warehouse_id = v_wh FOR UPDATE;

  SELECT COALESCE(NULLIF(b.avg_cost,0), NULLIF(p.buy_price,0), NULLIF(p.default_purchase_price,0), 0)
    INTO v_fallback FROM public.products p WHERE p.id = _mv.product_id;
  v_fallback := COALESCE(v_fallback, 0);

  IF v_signed > 0 THEN
    -- ===== RECEIPT =====
    SELECT r.unit_cost, r.source INTO v_unit, v_src FROM public._inv_cost_receipt_unit_cost(_mv, v_fallback) r;
    v_total := round(v_qty * v_unit, 6);
    v_new_qty := b.quantity + v_qty;

    IF _method = 'fifo' THEN
      v_need := v_qty;
      IF b.quantity < 0 THEN
        -- covers previously-unbacked stock; difference is a variance
        v_take := LEAST(v_need, -b.quantity);
        v_var := round(v_take * (v_unit - b.avg_cost), 6);
        v_need := v_need - v_take;
      END IF;
      IF v_need > 0 THEN
        INSERT INTO public.inventory_cost_layers(user_id, product_id, warehouse_id, movement_id, received_at, qty_in, qty_remaining, unit_cost)
        VALUES (_mv.user_id, _mv.product_id, v_wh, _mv.id, _mv.created_at, v_qty, v_need, v_unit);
      END IF;
      IF v_new_qty > 0 THEN
        SELECT COALESCE(SUM(qty_remaining * unit_cost),0) INTO v_new_val FROM public.inventory_cost_layers
         WHERE product_id = _mv.product_id AND warehouse_id = v_wh AND qty_remaining > 0;
        v_new_avg := v_new_val / v_new_qty;
      ELSE
        v_new_avg := v_unit; v_new_val := v_new_qty * v_unit;
      END IF;
    ELSE
      IF b.quantity < 0 AND v_new_qty >= 0 THEN
        v_new_val := round(v_new_qty * v_unit, 6);
        v_var := round((b.total_value + v_total) - v_new_val, 6);
        v_new_avg := CASE WHEN v_new_qty > 0 THEN v_unit ELSE b.avg_cost END;
      ELSIF b.quantity < 0 THEN
        v_var := round(v_qty * (v_unit - b.avg_cost), 6);
        v_new_val := round(v_new_qty * b.avg_cost, 6);
        v_new_avg := b.avg_cost;
      ELSE
        v_new_val := b.total_value + v_total;
        v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_val / v_new_qty ELSE v_unit END;
      END IF;
    END IF;

    INSERT INTO public.inventory_cost_entries(id, user_id, movement_id, product_id, warehouse_id, entry_type, method,
      quantity, unit_cost, total_cost, cost_source, negative_stock, negative_variance,
      balance_qty_after, balance_value_after, avg_cost_after, reference_type, reference_id, reference_line_id, movement_at)
    VALUES (v_entry, _mv.user_id, _mv.id, _mv.product_id, v_wh, 'in', _method,
      v_qty, v_unit, v_total, v_src, b.quantity < 0, v_var,
      v_new_qty, round(v_new_val,6), round(v_new_avg,6), _mv.reference_type, _mv.reference_id, _mv.reference_line_id, _mv.created_at);
  ELSE
    -- ===== ISSUE =====
    v_new_qty := b.quantity - v_qty;
    IF _method = 'fifo' THEN
      v_need := v_qty; v_last_cost := v_fallback;
      INSERT INTO public.inventory_cost_entries(id, user_id, movement_id, product_id, warehouse_id, entry_type, method,
        quantity, movement_at, reference_type, reference_id, reference_line_id)
      VALUES (v_entry, _mv.user_id, _mv.id, _mv.product_id, v_wh, 'out', _method, v_qty, _mv.created_at,
        _mv.reference_type, _mv.reference_id, _mv.reference_line_id);
      FOR l IN SELECT * FROM public.inventory_cost_layers
                WHERE product_id = _mv.product_id AND warehouse_id = v_wh AND qty_remaining > 0
                ORDER BY received_at, created_at FOR UPDATE LOOP
        EXIT WHEN v_need <= 0;
        v_take := LEAST(v_need, l.qty_remaining);
        UPDATE public.inventory_cost_layers SET qty_remaining = qty_remaining - v_take WHERE id = l.id;
        INSERT INTO public.inventory_cost_consumptions(user_id, entry_id, layer_id, quantity, unit_cost)
        VALUES (_mv.user_id, v_entry, l.id, v_take, l.unit_cost);
        v_total := v_total + v_take * l.unit_cost;
        v_last_cost := l.unit_cost;
        v_need := v_need - v_take;
      END LOOP;
      IF v_need > 0 THEN
        v_neg := true;
        v_total := v_total + v_need * v_last_cost;
      END IF;
      v_unit := CASE WHEN v_qty > 0 THEN v_total / v_qty ELSE 0 END;
      IF v_new_qty > 0 THEN
        SELECT COALESCE(SUM(qty_remaining * unit_cost),0) INTO v_new_val FROM public.inventory_cost_layers
         WHERE product_id = _mv.product_id AND warehouse_id = v_wh AND qty_remaining > 0;
        v_new_avg := v_new_val / v_new_qty;
      ELSE
        v_new_avg := v_last_cost; v_new_val := v_new_qty * v_last_cost;
      END IF;
      UPDATE public.inventory_cost_entries SET unit_cost = round(v_unit,6), total_cost = round(v_total,6),
        cost_source = CASE WHEN v_neg THEN 'fifo_negative' ELSE 'fifo_layers' END, negative_stock = v_neg,
        balance_qty_after = v_new_qty, balance_value_after = round(v_new_val,6), avg_cost_after = round(v_new_avg,6)
       WHERE id = v_entry;
    ELSE
      v_unit := v_fallback;
      v_total := round(v_qty * v_unit, 6);
      v_neg := v_new_qty < 0;
      IF v_new_qty > 0 THEN
        v_new_val := b.total_value - v_total; v_new_avg := v_unit;
      ELSE
        v_new_val := round(v_new_qty * v_unit, 6); v_new_avg := v_unit;
      END IF;
      INSERT INTO public.inventory_cost_entries(id, user_id, movement_id, product_id, warehouse_id, entry_type, method,
        quantity, unit_cost, total_cost, cost_source, negative_stock,
        balance_qty_after, balance_value_after, avg_cost_after, reference_type, reference_id, reference_line_id, movement_at)
      VALUES (v_entry, _mv.user_id, _mv.id, _mv.product_id, v_wh, 'out', _method,
        v_qty, round(v_unit,6), v_total, CASE WHEN b.avg_cost > 0 THEN 'average' ELSE 'product_cost' END, v_neg,
        v_new_qty, round(v_new_val,6), round(v_new_avg,6), _mv.reference_type, _mv.reference_id, _mv.reference_line_id, _mv.created_at);
    END IF;
  END IF;

  UPDATE public.inventory_cost_balances
     SET quantity = v_new_qty, total_value = round(v_new_val,6), avg_cost = round(v_new_avg,6), updated_at = now()
   WHERE product_id = _mv.product_id AND warehouse_id = v_wh;
  RETURN v_entry;
END $$;

-- 6) Reverse the engine effect of a deleted/changed movement --------------
CREATE OR REPLACE FUNCTION public._inv_cost_reverse_movement(_movement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.inventory_cost_entries%ROWTYPE;
  b public.inventory_cost_balances%ROWTYPE;
  c record;
  v_new_qty numeric; v_new_val numeric; v_new_avg numeric;
BEGIN
  FOR e IN SELECT * FROM public.inventory_cost_entries
            WHERE movement_id = _movement_id AND entry_type IN ('in','out') AND reversed_at IS NULL LOOP
    SELECT * INTO b FROM public.inventory_cost_balances
     WHERE product_id = e.product_id AND warehouse_id = e.warehouse_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF e.entry_type = 'in' THEN
      v_new_qty := b.quantity - e.quantity;
      IF e.method = 'fifo' THEN
        UPDATE public.inventory_cost_layers SET qty_remaining = 0 WHERE movement_id = _movement_id;
      END IF;
      v_new_val := b.total_value - e.total_cost;
    ELSE
      v_new_qty := b.quantity + e.quantity;
      IF e.method = 'fifo' THEN
        FOR c IN SELECT * FROM public.inventory_cost_consumptions WHERE entry_id = e.id LOOP
          UPDATE public.inventory_cost_layers SET qty_remaining = qty_remaining + c.quantity WHERE id = c.layer_id;
        END LOOP;
      END IF;
      v_new_val := b.total_value + e.total_cost;
    END IF;

    IF e.method = 'fifo' AND v_new_qty > 0 THEN
      SELECT COALESCE(SUM(qty_remaining * unit_cost),0) INTO v_new_val FROM public.inventory_cost_layers
       WHERE product_id = e.product_id AND warehouse_id = e.warehouse_id AND qty_remaining > 0;
    END IF;
    v_new_avg := CASE WHEN v_new_qty > 0 THEN v_new_val / v_new_qty ELSE b.avg_cost END;
    IF v_new_qty <= 0 THEN v_new_val := round(v_new_qty * b.avg_cost, 6); END IF;

    UPDATE public.inventory_cost_balances
       SET quantity = v_new_qty, total_value = round(v_new_val,6), avg_cost = round(v_new_avg,6), updated_at = now()
     WHERE product_id = e.product_id AND warehouse_id = e.warehouse_id;

    UPDATE public.inventory_cost_entries SET reversed_at = now() WHERE id = e.id;
    INSERT INTO public.inventory_cost_entries(user_id, movement_id, product_id, warehouse_id, entry_type, method,
      quantity, unit_cost, total_cost, cost_source, reverses_entry_id,
      balance_qty_after, balance_value_after, avg_cost_after, reference_type, reference_id, reference_line_id, movement_at)
    VALUES (e.user_id, e.movement_id, e.product_id, e.warehouse_id, 'reversal', e.method,
      e.quantity, e.unit_cost, e.total_cost, 'reversal', e.id,
      v_new_qty, round(v_new_val,6), round(v_new_avg,6), e.reference_type, e.reference_id, e.reference_line_id, now());
  END LOOP;
END $$;

-- 7) Trigger on the single stock ledger ----------------------------------
CREATE OR REPLACE FUNCTION public.tg_inventory_costing_engine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  s record;
BEGIN
  SELECT costing_engine_enabled, costing_effective_from, inventory_valuation_method
    INTO s FROM public.company_settings WHERE user_id = v_owner LIMIT 1;
  IF NOT FOUND OR NOT COALESCE(s.costing_engine_enabled, false) THEN
    RETURN NULL;
  END IF;

  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public._inv_cost_reverse_movement(OLD.id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE')
     AND (s.costing_effective_from IS NULL OR NEW.created_at >= s.costing_effective_from) THEN
    PERFORM public._inv_cost_apply_movement(NEW, s.inventory_valuation_method);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_zz_inventory_costing_engine ON public.stock_movements;
CREATE TRIGGER trg_zz_inventory_costing_engine
  AFTER INSERT OR DELETE OR UPDATE OF product_id, warehouse_id, movement_type, quantity, unit_cost
  ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_inventory_costing_engine();

-- 8) Authorization helper ------------------------------------------------
CREATE OR REPLACE FUNCTION public._inv_costing_owner_for_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  v_owner := COALESCE(public.get_team_owner_id(auth.uid()), auth.uid());
  IF v_owner <> auth.uid()
     AND NOT (public.has_role(auth.uid(), 'admin') AND public.is_team_member(auth.uid(), v_owner)) THEN
    RAISE EXCEPTION 'فقط مالك الشركة أو مدير النظام يستطيع تعديل طريقة تقييم المخزون';
  END IF;
  RETURN v_owner;
END $$;

-- 9) Readiness report (read only) ---------------------------------------
CREATE OR REPLACE FUNCTION public.inventory_costing_readiness()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := COALESCE(public.get_team_owner_id(auth.uid()), auth.uid()); r jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (v_owner = auth.uid() OR public.is_team_member(auth.uid(), v_owner)) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  SELECT jsonb_build_object(
    'stocked_lines', COUNT(*) FILTER (WHERE b.quantity_on_hand <> 0),
    'positive_lines', COUNT(*) FILTER (WHERE b.quantity_on_hand > 0),
    'negative_lines', COUNT(*) FILTER (WHERE b.quantity_on_hand < 0),
    'zero_cost_lines', COUNT(*) FILTER (WHERE b.quantity_on_hand > 0
        AND COALESCE(NULLIF(p.buy_price,0), NULLIF(p.default_purchase_price,0), 0) = 0),
    'opening_value', COALESCE(SUM(GREATEST(b.quantity_on_hand,0)
        * COALESCE(NULLIF(p.buy_price,0), NULLIF(p.default_purchase_price,0), 0)),0)
  ) INTO r
  FROM public.product_warehouse_balances b JOIN public.products p ON p.id = b.product_id
  WHERE b.user_id = v_owner AND COALESCE(p.product_type,'') <> 'service';
  RETURN r;
END $$;

-- 10) Activate (one-time, audited) --------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_inventory_costing(_system text, _method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := public._inv_costing_owner_for_admin();
  v_now timestamptz := now();
  v_old record;
  v_lines int := 0; v_value numeric := 0;
  r record; v_cost numeric;
BEGIN
  IF _system NOT IN ('perpetual','periodic') OR _method NOT IN ('moving_avg','weighted_avg_period','fifo')
     OR (_system = 'perpetual' AND _method = 'weighted_avg_period')
     OR (_system = 'periodic' AND _method = 'moving_avg') THEN
    RAISE EXCEPTION 'تركيبة غير مسموحة بين نظام الجرد وطريقة التقييم';
  END IF;

  SELECT inventory_system, inventory_valuation_method, costing_engine_enabled INTO v_old
    FROM public.company_settings WHERE user_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'لا توجد إعدادات للشركة'; END IF;
  IF v_old.costing_engine_enabled THEN RAISE EXCEPTION 'محرك التكلفة مفعّل مسبقًا'; END IF;

  -- start from a clean slate for this tenant (nothing posted depends on these yet)
  DELETE FROM public.inventory_cost_consumptions WHERE user_id = v_owner;
  DELETE FROM public.inventory_cost_layers WHERE user_id = v_owner;
  DELETE FROM public.inventory_cost_entries WHERE user_id = v_owner;
  DELETE FROM public.inventory_cost_balances WHERE user_id = v_owner;

  FOR r IN SELECT b.product_id, b.warehouse_id, b.quantity_on_hand AS qty,
                  COALESCE(NULLIF(p.buy_price,0), NULLIF(p.default_purchase_price,0), 0) AS cost
             FROM public.product_warehouse_balances b JOIN public.products p ON p.id = b.product_id
            WHERE b.user_id = v_owner AND b.quantity_on_hand <> 0 AND COALESCE(p.product_type,'') <> 'service' LOOP
    v_cost := r.cost;
    INSERT INTO public.inventory_cost_balances(product_id, warehouse_id, user_id, quantity, total_value, avg_cost)
    VALUES (r.product_id, r.warehouse_id, v_owner, r.qty, round(r.qty * v_cost, 6), v_cost);
    IF r.qty > 0 AND _method = 'fifo' THEN
      INSERT INTO public.inventory_cost_layers(user_id, product_id, warehouse_id, source, received_at, qty_in, qty_remaining, unit_cost)
      VALUES (v_owner, r.product_id, r.warehouse_id, 'opening', v_now - interval '1 second', r.qty, r.qty, v_cost);
    END IF;
    INSERT INTO public.inventory_cost_entries(user_id, product_id, warehouse_id, entry_type, method, quantity, unit_cost,
      total_cost, cost_source, negative_stock, balance_qty_after, balance_value_after, avg_cost_after, movement_at)
    VALUES (v_owner, r.product_id, r.warehouse_id, 'opening', _method, r.qty, v_cost,
      round(r.qty * v_cost, 6), 'last_purchase_price', r.qty < 0, r.qty, round(r.qty * v_cost, 6), v_cost, v_now);
    v_lines := v_lines + 1;
    v_value := v_value + GREATEST(r.qty,0) * v_cost;
  END LOOP;

  UPDATE public.company_settings
     SET inventory_system = _system, inventory_valuation_method = _method,
         costing_engine_enabled = true, costing_effective_from = v_now
   WHERE user_id = v_owner;

  INSERT INTO public.inventory_costing_changes(user_id, changed_by, action, old_system, new_system, old_method, new_method, effective_from, details)
  VALUES (v_owner, auth.uid(), 'activate', v_old.inventory_system, _system, v_old.inventory_valuation_method, _method, v_now,
          jsonb_build_object('opening_lines', v_lines, 'opening_value', round(v_value,2)));

  RETURN jsonb_build_object('opening_lines', v_lines, 'opening_value', round(v_value,2), 'effective_from', v_now);
END $$;

-- 11) Choose method before activation (audited) ---------------------------
CREATE OR REPLACE FUNCTION public.set_inventory_costing_choice(_system text, _method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid := public._inv_costing_owner_for_admin(); v_old record;
BEGIN
  SELECT inventory_system, inventory_valuation_method, costing_engine_enabled INTO v_old
    FROM public.company_settings WHERE user_id = v_owner FOR UPDATE;
  IF v_old.costing_engine_enabled THEN RAISE EXCEPTION 'طريقة تقييم المخزون مقفلة بعد التفعيل'; END IF;
  UPDATE public.company_settings SET inventory_system = _system, inventory_valuation_method = _method WHERE user_id = v_owner;
  INSERT INTO public.inventory_costing_changes(user_id, changed_by, action, old_system, new_system, old_method, new_method)
  VALUES (v_owner, auth.uid(), 'choose', v_old.inventory_system, _system, v_old.inventory_valuation_method, _method);
END $$;

REVOKE ALL ON FUNCTION public._inv_cost_apply_movement(public.stock_movements, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inv_cost_reverse_movement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inv_cost_receipt_unit_cost(public.stock_movements, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_costing_readiness() TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_inventory_costing(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_costing_choice(text, text) TO authenticated;
