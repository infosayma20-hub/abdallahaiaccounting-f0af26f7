
-- ============================================================================
-- Phase 2: Production Accounting Integration
-- ============================================================================

-- 1) Settings table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_accounting_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  raw_materials_account TEXT NOT NULL DEFAULT '1147',
  wip_account TEXT NOT NULL DEFAULT '1149',
  finished_goods_account TEXT NOT NULL DEFAULT '1148',
  labor_expense_account TEXT NOT NULL DEFAULT '5125',
  overhead_expense_account TEXT NOT NULL DEFAULT '5135',
  variance_account TEXT NOT NULL DEFAULT '5145',
  labor_payable_account TEXT NOT NULL DEFAULT '2181',
  overhead_payable_account TEXT NOT NULL DEFAULT '2182',
  default_currency TEXT NOT NULL DEFAULT 'شيكل',
  auto_post_on_release BOOLEAN NOT NULL DEFAULT true,
  auto_post_on_complete BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_accounting_settings TO authenticated;
GRANT ALL ON public.production_accounting_settings TO service_role;
ALTER TABLE public.production_accounting_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prod settings" ON public.production_accounting_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_prod_settings_touch BEFORE UPDATE ON public.production_accounting_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 2) Seed standard IFRS production accounts ------------------------------------
CREATE OR REPLACE FUNCTION public.seed_production_accounts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings_id UUID;
  v_created INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  -- Standard production accounts (create only if user does not already have them)
  INSERT INTO public.accounts(user_id, account_code, account_name, account_type, parent_code, is_active, is_system, notes)
  SELECT v_uid, code, name, atype, pcode, true, false, 'حساب إنتاج قياسي - مضاف تلقائياً'
  FROM (VALUES
    ('1147','المواد الخام للإنتاج','أصول','1140'),
    ('1149','إنتاج تحت التشغيل (WIP)','أصول','1140'),
    ('1148','المنتجات التامة','أصول','1140'),
    ('5125','عمالة إنتاج مباشرة','مصاريف','5150'),
    ('5135','تكاليف صناعية غير مباشرة','مصاريف',NULL),
    ('5145','فروق تكلفة الإنتاج','مصاريف',NULL),
    ('2181','مستحقات عمالة الإنتاج','خصوم',NULL),
    ('2182','مستحقات تكاليف صناعية','خصوم',NULL)
  ) v(code,name,atype,pcode)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.user_id = v_uid AND a.account_code = v.code
  );
  GET DIAGNOSTICS v_created = ROW_COUNT;

  -- Ensure settings row exists
  INSERT INTO public.production_accounting_settings(user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_settings_id;

  IF v_settings_id IS NULL THEN
    SELECT id INTO v_settings_id FROM public.production_accounting_settings WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'accounts_created', v_created, 'settings_id', v_settings_id);
END;
$$;

-- 3) Post journal helper --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_production_order_journal(_order_id UUID, _phase TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.production_orders;
  st  public.production_accounting_settings;
  v_lines jsonb := '[]'::jsonb;
  v_amt   NUMERIC;
  v_var   NUMERIC;
  v_desc  TEXT;
  v_result jsonb;
BEGIN
  SELECT * INTO ord FROM public.production_orders WHERE id = _order_id AND user_id = auth.uid();
  IF ord IS NULL THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;

  SELECT * INTO st FROM public.production_accounting_settings WHERE user_id = ord.user_id;
  IF st IS NULL THEN
    PERFORM public.seed_production_accounts();
    SELECT * INTO st FROM public.production_accounting_settings WHERE user_id = ord.user_id;
  END IF;

  IF _phase = 'release' THEN
    v_amt := COALESCE(ord.total_material_cost, 0);
    IF v_amt <= 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no material cost'); END IF;
    v_desc := 'صرف مواد خام - أمر إنتاج ' || COALESCE(ord.order_number, ord.id::text);
    v_lines := jsonb_build_array(jsonb_build_object(
      'debit_account_code', st.wip_account,
      'credit_account_code', st.raw_materials_account,
      'amount', v_amt,
      'description', v_desc
    ));

  ELSIF _phase = 'absorb_labor' THEN
    v_amt := COALESCE(ord.total_labor_cost, 0);
    IF v_amt <= 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no labor cost'); END IF;
    v_desc := 'استيعاب عمالة إنتاج - أمر ' || COALESCE(ord.order_number, ord.id::text);
    v_lines := jsonb_build_array(jsonb_build_object(
      'debit_account_code', st.wip_account,
      'credit_account_code', st.labor_payable_account,
      'amount', v_amt,
      'description', v_desc
    ));

  ELSIF _phase = 'absorb_overhead' THEN
    v_amt := COALESCE(ord.total_overhead_cost, 0);
    IF v_amt <= 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no overhead cost'); END IF;
    v_desc := 'استيعاب تكاليف صناعية - أمر ' || COALESCE(ord.order_number, ord.id::text);
    v_lines := jsonb_build_array(jsonb_build_object(
      'debit_account_code', st.wip_account,
      'credit_account_code', st.overhead_payable_account,
      'amount', v_amt,
      'description', v_desc
    ));

  ELSIF _phase = 'complete' THEN
    v_amt := COALESCE(ord.total_cost, 0) - COALESCE(ord.variance_amount, 0);
    IF v_amt <= 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no completion cost'); END IF;
    v_desc := 'استلام منتجات تامة - أمر ' || COALESCE(ord.order_number, ord.id::text);
    v_lines := jsonb_build_array(jsonb_build_object(
      'debit_account_code', st.finished_goods_account,
      'credit_account_code', st.wip_account,
      'amount', v_amt,
      'description', v_desc
    ));

  ELSIF _phase = 'variance' THEN
    v_var := COALESCE(ord.variance_amount, 0);
    IF v_var = 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no variance'); END IF;
    v_desc := 'فرق تكلفة إنتاج - أمر ' || COALESCE(ord.order_number, ord.id::text);
    -- Positive variance = unfavorable (actual > standard) -> charge variance expense
    -- Negative variance = favorable -> credit variance
    IF v_var > 0 THEN
      v_lines := jsonb_build_array(jsonb_build_object(
        'debit_account_code', st.variance_account,
        'credit_account_code', st.wip_account,
        'amount', v_var,
        'description', v_desc
      ));
    ELSE
      v_lines := jsonb_build_array(jsonb_build_object(
        'debit_account_code', st.wip_account,
        'credit_account_code', st.variance_account,
        'amount', ABS(v_var),
        'description', v_desc
      ));
    END IF;

  ELSE
    RAISE EXCEPTION 'unknown phase: %', _phase;
  END IF;

  v_result := public.create_journal_entry_atomic(
    p_user_id        => ord.user_id,
    p_entry_date     => COALESCE(ord.production_date, CURRENT_DATE),
    p_description    => v_desc,
    p_lines          => v_lines,
    p_currency       => st.default_currency,
    p_reference      => 'PROD-' || COALESCE(ord.order_number, ord.id::text) || '-' || _phase,
    p_idempotency_key=> 'PROD-'||ord.id::text||'-'||_phase,
    p_source         => 'production'
  );

  RETURN jsonb_build_object('ok', true, 'phase', _phase, 'journal', v_result);
END;
$$;

-- 4) Release production order (consume raw materials, create WIP journal) -------
CREATE OR REPLACE FUNCTION public.release_production_order(_order_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.production_orders;
  fml public.production_formulas;
  itm RECORD;
  v_mult NUMERIC;
  v_qty  NUMERIC;
  v_unit_cost NUMERIC;
  v_material_total NUMERIC := 0;
  v_moves INT := 0;
  st public.production_accounting_settings;
BEGIN
  SELECT * INTO ord FROM public.production_orders WHERE id = _order_id AND user_id = auth.uid();
  IF ord IS NULL THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  IF ord.status NOT IN ('draft','approved') THEN
    RAISE EXCEPTION 'Cannot release order in status: %', ord.status;
  END IF;

  SELECT * INTO fml FROM public.production_formulas WHERE id = ord.formula_id;
  IF fml IS NULL THEN RAISE EXCEPTION 'Formula missing'; END IF;

  v_mult := COALESCE(ord.planned_quantity, ord.quantity) / NULLIF(fml.output_quantity, 0);

  -- Snapshot items + consume materials
  FOR itm IN
    SELECT i.*, COALESCE(p.standard_cost, p.average_cost, p.buy_price, 0) AS unit_cost
    FROM public.production_formula_items i
    JOIN public.products p ON p.id = i.product_id
    WHERE i.formula_id = fml.id
    ORDER BY i.sequence, i.id
  LOOP
    v_qty := itm.quantity * v_mult * (1 + itm.scrap_pct / 100.0);
    v_unit_cost := itm.unit_cost;

    INSERT INTO public.production_order_items(order_id, product_id, planned_quantity, scrap_pct, unit_cost, total_cost, sequence)
    VALUES (ord.id, itm.product_id, v_qty, itm.scrap_pct, v_unit_cost, v_qty * v_unit_cost, itm.sequence);

    INSERT INTO public.stock_movements(user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_id, unit_cost, notes)
    VALUES (ord.user_id, itm.product_id, 'صادر', v_qty::numeric(12,2),
            COALESCE(ord.raw_warehouse_id, fml.raw_warehouse_id, ord.warehouse_id),
            'production_order_consume', ord.id, v_unit_cost,
            'صرف مادة خام - أمر إنتاج');
    v_moves := v_moves + 1;
    v_material_total := v_material_total + (v_qty * v_unit_cost);
  END LOOP;

  -- Update order costs & status
  UPDATE public.production_orders
     SET status = 'released',
         released_at = now(),
         started_at = COALESCE(started_at, now()),
         total_material_cost = v_material_total,
         total_labor_cost = COALESCE(NULLIF(total_labor_cost,0), fml.labor_cost_per_batch * v_mult),
         total_overhead_cost = COALESCE(NULLIF(total_overhead_cost,0), fml.overhead_cost_per_batch * v_mult + v_material_total * fml.overhead_rate_pct / 100.0),
         planned_quantity = COALESCE(planned_quantity, quantity),
         updated_at = now()
   WHERE id = ord.id;

  -- Log cost breakdown
  INSERT INTO public.production_costs(order_id, cost_type, amount, description)
  VALUES (ord.id, 'material', v_material_total, 'إجمالي المواد الخام المصروفة');

  SELECT * INTO st FROM public.production_accounting_settings WHERE user_id = ord.user_id;
  IF st IS NULL THEN
    PERFORM public.seed_production_accounts();
    SELECT * INTO st FROM public.production_accounting_settings WHERE user_id = ord.user_id;
  END IF;

  IF st.auto_post_on_release THEN
    PERFORM public.post_production_order_journal(ord.id, 'release');
    -- also absorb planned labor & overhead
    SELECT * INTO ord FROM public.production_orders WHERE id = _order_id;
    IF ord.total_labor_cost > 0 THEN
      PERFORM public.post_production_order_journal(ord.id, 'absorb_labor');
      INSERT INTO public.production_costs(order_id, cost_type, amount, description)
      VALUES (ord.id, 'labor', ord.total_labor_cost, 'استيعاب عمالة إنتاج مخططة');
    END IF;
    IF ord.total_overhead_cost > 0 THEN
      PERFORM public.post_production_order_journal(ord.id, 'absorb_overhead');
      INSERT INTO public.production_costs(order_id, cost_type, amount, description)
      VALUES (ord.id, 'overhead', ord.total_overhead_cost, 'استيعاب تكاليف صناعية مخططة');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'moves', v_moves, 'material_cost', v_material_total, 'status', 'released');
END;
$$;

-- 5) Complete production order --------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_production_order(
  _order_id UUID,
  _actual_qty NUMERIC DEFAULT NULL,
  _actual_labor NUMERIC DEFAULT NULL,
  _actual_overhead NUMERIC DEFAULT NULL,
  _scrap_qty NUMERIC DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.production_orders;
  fml public.production_formulas;
  bp RECORD;
  v_qty NUMERIC;
  v_total_cost NUMERIC;
  v_unit_cost  NUMERIC;
  v_variance   NUMERIC := 0;
  v_planned_cost NUMERIC;
  st public.production_accounting_settings;
BEGIN
  SELECT * INTO ord FROM public.production_orders WHERE id = _order_id AND user_id = auth.uid();
  IF ord IS NULL THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  IF ord.status <> 'released' AND ord.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Cannot complete order in status: %', ord.status;
  END IF;

  SELECT * INTO fml FROM public.production_formulas WHERE id = ord.formula_id;

  v_qty := COALESCE(_actual_qty, ord.planned_quantity, ord.quantity);

  -- Update actual labor / overhead if provided
  IF _actual_labor IS NOT NULL THEN
    UPDATE public.production_orders SET total_labor_cost = _actual_labor WHERE id = ord.id;
  END IF;
  IF _actual_overhead IS NOT NULL THEN
    UPDATE public.production_orders SET total_overhead_cost = _actual_overhead WHERE id = ord.id;
  END IF;

  -- Refresh
  SELECT * INTO ord FROM public.production_orders WHERE id = _order_id;

  v_total_cost := COALESCE(ord.total_material_cost,0) + COALESCE(ord.total_labor_cost,0) + COALESCE(ord.total_overhead_cost,0);
  v_unit_cost  := CASE WHEN v_qty > 0 THEN v_total_cost / v_qty ELSE 0 END;

  -- Variance = actual cost vs planned (formula standard)
  v_planned_cost := public.calculate_formula_standard_cost(fml.id) * (v_qty / NULLIF(fml.output_quantity, 0));
  v_variance := v_total_cost - v_planned_cost;

  -- Receive finished goods
  INSERT INTO public.stock_movements(user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_id, unit_cost, notes)
  VALUES (ord.user_id, fml.output_product_id, 'وارد', v_qty::numeric(12,2),
          COALESCE(ord.output_warehouse_id, fml.output_warehouse_id, ord.warehouse_id),
          'production_order_output', ord.id, v_unit_cost,
          'استلام منتج تام - أمر إنتاج');

  -- Update product's average_cost (weighted)
  UPDATE public.products p
     SET average_cost = CASE
       WHEN COALESCE(p.quantity,0) > 0 THEN
         ((COALESCE(p.average_cost,0) * GREATEST(COALESCE(p.quantity,0) - v_qty, 0)) + v_total_cost)
         / NULLIF(COALESCE(p.quantity,0), 0)
       ELSE v_unit_cost
     END,
     updated_at = now()
   WHERE id = fml.output_product_id;

  -- Byproducts
  FOR bp IN SELECT * FROM public.production_formula_byproducts WHERE formula_id = fml.id LOOP
    INSERT INTO public.stock_movements(user_id, product_id, movement_type, quantity, warehouse_id, reference_type, reference_id, unit_cost, notes)
    VALUES (ord.user_id, bp.product_id, 'وارد', (bp.quantity * (v_qty / NULLIF(fml.output_quantity,0)))::numeric(12,2),
            COALESCE(ord.output_warehouse_id, fml.output_warehouse_id, ord.warehouse_id),
            'production_order_byproduct', ord.id, bp.unit_value,
            'منتج ثانوي - أمر إنتاج');
    INSERT INTO public.production_costs(order_id, cost_type, amount, quantity, reference_product_id, description)
    VALUES (ord.id, 'byproduct_credit', bp.unit_value * bp.quantity, bp.quantity, bp.product_id, 'إيراد منتج ثانوي');
  END LOOP;

  UPDATE public.production_orders
     SET status='completed',
         completed_at=now(),
         actual_quantity = v_qty,
         scrap_quantity  = COALESCE(_scrap_qty, 0),
         total_cost = v_total_cost,
         unit_cost  = v_unit_cost,
         variance_amount = v_variance,
         posted_by = auth.uid(),
         updated_at = now()
   WHERE id = ord.id;

  INSERT INTO public.production_costs(order_id, cost_type, amount, description)
  VALUES (ord.id, 'variance', v_variance, 'فرق التكلفة الفعلي مقابل المعياري');

  SELECT * INTO st FROM public.production_accounting_settings WHERE user_id = ord.user_id;
  IF st IS NULL THEN
    PERFORM public.seed_production_accounts();
    SELECT * INTO st FROM public.production_accounting_settings WHERE user_id = ord.user_id;
  END IF;

  IF st.auto_post_on_complete THEN
    PERFORM public.post_production_order_journal(ord.id, 'complete');
    IF v_variance <> 0 THEN
      PERFORM public.post_production_order_journal(ord.id, 'variance');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status', 'completed',
    'actual_qty', v_qty, 'total_cost', v_total_cost,
    'unit_cost', v_unit_cost, 'variance', v_variance
  );
END;
$$;

-- 6) Cancel production order (only before released) ----------------------------
CREATE OR REPLACE FUNCTION public.cancel_production_order(_order_id UUID, _reason TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.production_orders;
BEGIN
  SELECT * INTO ord FROM public.production_orders WHERE id = _order_id AND user_id = auth.uid();
  IF ord IS NULL THEN RAISE EXCEPTION 'Order not found or access denied'; END IF;
  IF ord.status NOT IN ('draft','approved') THEN
    RAISE EXCEPTION 'Cannot cancel after release (status=%)', ord.status;
  END IF;

  UPDATE public.production_orders
     SET status = 'cancelled',
         notes = COALESCE(_reason, notes),
         updated_at = now()
   WHERE id = ord.id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;
