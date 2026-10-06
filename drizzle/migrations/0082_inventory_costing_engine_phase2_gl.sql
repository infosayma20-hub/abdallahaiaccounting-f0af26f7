-- ===== Phase 2: costing engine -> GL + POS + line cost write-back =====

CREATE OR REPLACE FUNCTION public._inv_cost_mode(_owner uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN costing_engine_enabled THEN inventory_system END
  FROM public.company_settings WHERE user_id = _owner LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._inv_cost_account(_owner uuid, _role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sys_role text; v_parent text; v_name text; v_cands text[]; v_code text; v_c text;
  v_type text; v_nature text;
BEGIN
  IF _role = 'purchases' OR _role = 'purchase_returns' THEN
    IF _role = 'purchase_returns' THEN
      SELECT a.account_code INTO v_code FROM public.accounts a
       WHERE a.user_id = _owner AND a.account_code = '5160' AND COALESCE(a.is_active,true)
         AND NOT EXISTS (SELECT 1 FROM public.accounts k WHERE k.user_id = _owner AND k.parent_code = a.account_code AND COALESCE(k.is_active,true));
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
    END IF;
    SELECT a.account_code INTO v_code FROM public.accounts a
     WHERE a.user_id = _owner AND COALESCE(a.is_active,true)
       AND (a.account_code = '5110' OR a.parent_code = '5110')
       AND a.account_code <> '5160' AND COALESCE(a.system_role,'') <> 'purchase_returns'
       AND NOT EXISTS (SELECT 1 FROM public.accounts k WHERE k.user_id = _owner AND k.parent_code = a.account_code AND COALESCE(k.is_active,true))
     ORDER BY (a.account_code = '5111') DESC, a.account_code LIMIT 1;
    IF v_code IS NULL THEN RAISE EXCEPTION 'لا يوجد حساب مشتريات فرعي (تحت 5110) لهذه الشركة'; END IF;
    RETURN v_code;
  END IF;

  IF _role = 'inventory' THEN
    v_sys_role := 'inventory_engine'; v_parent := '1140'; v_name := 'مخزون البضاعة (بالتكلفة الفعلية)';
    v_cands := ARRAY['1141','1142','1143','1144','1147'];
  ELSIF _role = 'cogs' THEN
    v_sys_role := 'cogs_engine'; v_parent := '5100'; v_name := 'تكلفة البضاعة المباعة (بالتكلفة الفعلية)';
    v_cands := ARRAY['5103','5104','5105','5106','5107'];
  ELSIF _role = 'variance' THEN
    v_sys_role := 'inventory_cost_variance'; v_parent := '5100'; v_name := 'فروقات تكلفة المخزون';
    v_cands := ARRAY['5108','5109','5104','5105','5106','5107'];
  ELSE
    RAISE EXCEPTION 'دور حساب غير معروف: %', _role;
  END IF;

  SELECT account_code INTO v_code FROM public.accounts
   WHERE user_id = _owner AND system_role = v_sys_role AND COALESCE(is_active,true) LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  SELECT account_type, COALESCE(nature,'debit') INTO v_type, v_nature
    FROM public.accounts WHERE user_id = _owner AND account_code = v_parent;
  IF v_type IS NULL THEN RAISE EXCEPTION 'الحساب الرئيسي % غير موجود لهذه الشركة', v_parent; END IF;

  FOREACH v_c IN ARRAY v_cands LOOP
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = _owner AND account_code = v_c) THEN
      v_code := v_c; EXIT;
    END IF;
  END LOOP;
  IF v_code IS NULL THEN RAISE EXCEPTION 'لا يوجد رقم حساب متاح تحت % لدور %', v_parent, _role; END IF;

  INSERT INTO public.accounts(user_id, account_code, account_name, account_type, parent_code, is_system, is_active,
    is_system_protected, system_role, nature, description_ar)
  VALUES (_owner, v_code, v_name, v_type, v_parent, true, true, true, v_sys_role, v_nature,
    'يُستخدم تلقائيًا من محرك تكلفة المخزون');
  RETURN v_code;
END $$;

CREATE OR REPLACE FUNCTION public._inv_cost_post_gl(_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.inventory_cost_entries%ROWTYPE;
  t record;
  v_inv text; v_cogs text; v_var text;
  v_dr text; v_cr text; v_desc text; v_inv_type text; v_inv_date date; v_ref text;
  v_date date;
  v_posted boolean := false;
BEGIN
  SELECT * INTO e FROM public.inventory_cost_entries WHERE id = _entry_id;
  IF NOT FOUND OR public._inv_cost_mode(e.user_id) IS DISTINCT FROM 'perpetual' THEN RETURN; END IF;
  IF e.reference_type IN ('pos_order_line_sale','pos_order_line_return') THEN RETURN; END IF;

  v_date := (e.movement_at AT TIME ZONE 'Asia/Hebron')::date;

  IF e.entry_type = 'reversal' THEN
    FOR t IN SELECT * FROM public.transactions
              WHERE user_id = e.user_id AND COALESCE(is_deleted,false) = false
                AND idempotency_key IN ('INVCOST-' || e.reverses_entry_id, 'INVCOST-VAR-' || e.reverses_entry_id) LOOP
      INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code,
        amount, currency, transaction_type, reference, idempotency_key)
      VALUES (e.user_id, (now() AT TIME ZONE 'Asia/Hebron')::date, 'عكس: ' || t.description,
        t.credit_account_code, t.debit_account_code, t.amount, 'شيكل', 'inventory_cost_reversal', t.reference,
        'INVCOST-REV-' || t.id)
      ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END LOOP;
    RETURN;
  END IF;

  IF e.entry_type NOT IN ('in','out') THEN RETURN; END IF;

  IF e.reference_type IN ('invoice','purchase_invoice','invoice_void') THEN
    SELECT i.invoice_type, i.invoice_date, i.invoice_number INTO v_inv_type, v_inv_date, v_ref
      FROM public.invoices i
     WHERE i.id = COALESCE((SELECT ii.invoice_id FROM public.invoice_items ii WHERE ii.id = e.reference_line_id), e.reference_id);
    IF e.reference_type <> 'invoice_void' AND v_inv_date IS NOT NULL THEN v_date := v_inv_date; END IF;
  END IF;

  v_inv := public._inv_cost_account(e.user_id, 'inventory');
  v_cogs := public._inv_cost_account(e.user_id, 'cogs');

  IF e.reference_type IN ('invoice','purchase_invoice') AND e.entry_type = 'in' AND v_inv_type = 'purchase' THEN
    v_dr := v_inv; v_cr := public._inv_cost_account(e.user_id, 'purchases'); v_desc := 'إثبات مشتريات في المخزون';
  ELSIF e.reference_type = 'invoice' AND e.entry_type = 'out' AND v_inv_type IN ('sale','sales') THEN
    v_dr := v_cogs; v_cr := v_inv; v_desc := 'تكلفة البضاعة المباعة - فاتورة';
  ELSIF e.reference_type = 'invoice_void' AND e.entry_type = 'in' AND v_inv_type IN ('sale','sales') THEN
    v_dr := v_inv; v_cr := v_cogs; v_desc := 'عكس تكلفة مبيعات - إلغاء فاتورة';
  ELSIF e.reference_type = 'invoice_void' AND e.entry_type = 'out' AND v_inv_type = 'purchase' THEN
    v_dr := public._inv_cost_account(e.user_id, 'purchases'); v_cr := v_inv; v_desc := 'عكس مشتريات من المخزون - إلغاء فاتورة';
  ELSIF e.reference_type = 'delivery_note' THEN
    IF e.entry_type = 'out' THEN v_dr := v_cogs; v_cr := v_inv; ELSE v_dr := v_inv; v_cr := v_cogs; END IF;
    v_desc := 'تكلفة البضاعة - سند تسليم';
  ELSIF e.reference_type = 'sales_return' AND e.entry_type = 'in' THEN
    v_dr := v_inv; v_cr := v_cogs; v_desc := 'عكس تكلفة مبيعات - مرتجع';
  ELSIF e.reference_type = 'purchase_return' AND e.entry_type = 'out' THEN
    v_dr := public._inv_cost_account(e.user_id, 'purchase_returns'); v_cr := v_inv; v_desc := 'إخراج مردود مشتريات من المخزون';
  ELSE
    RETURN;
  END IF;

  IF e.total_cost > 0 THEN
    INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key)
    VALUES (e.user_id, v_date, v_desc, v_dr, v_cr, round(e.total_cost, 2), 'شيكل', 'inventory_cost',
      v_ref, 'INVCOST-' || e.id)
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    v_posted := true;
  END IF;

  IF v_posted AND e.entry_type = 'in' AND round(COALESCE(e.negative_variance,0), 2) <> 0 THEN
    v_var := public._inv_cost_account(e.user_id, 'variance');
    INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key)
    VALUES (e.user_id, v_date, 'فرق تكلفة بيع سابق بالسالب',
      CASE WHEN e.negative_variance > 0 THEN v_var ELSE v_inv END,
      CASE WHEN e.negative_variance > 0 THEN v_inv ELSE v_var END,
      round(abs(e.negative_variance), 2), 'شيكل', 'inventory_cost_variance', v_ref, 'INVCOST-VAR-' || e.id)
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._inv_cost_writeback(_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.inventory_cost_entries%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.inventory_cost_entries WHERE id = _entry_id;
  IF NOT FOUND OR e.entry_type <> 'out' THEN RETURN; END IF;
  IF e.reference_type = 'pos_order_line_sale' AND e.reference_id IS NOT NULL THEN
    UPDATE public.pos_order_lines SET cost_price = round(e.unit_cost, 4) WHERE id = e.reference_id;
  ELSIF e.reference_type = 'invoice' AND e.reference_line_id IS NOT NULL THEN
    UPDATE public.invoice_items ii
       SET line_profit = CASE WHEN ii.line_profit IS NULL THEN NULL
                              ELSE round(ii.line_profit + (COALESCE(ii.cost_price,0) - e.unit_cost)
                                     * (COALESCE(ii.quantity,0) + COALESCE(ii.bonus_quantity,0)), 4) END,
           cost_price = round(e.unit_cost, 4)
      FROM public.invoices i
     WHERE ii.id = e.reference_line_id AND i.id = ii.invoice_id AND i.invoice_type IN ('sale','sales');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_inventory_costing_engine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  s record; v_entry uuid; r record;
BEGIN
  SELECT costing_engine_enabled, costing_effective_from, inventory_valuation_method
    INTO s FROM public.company_settings WHERE user_id = v_owner LIMIT 1;
  IF NOT FOUND OR NOT COALESCE(s.costing_engine_enabled, false) THEN
    RETURN NULL;
  END IF;

  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public._inv_cost_reverse_movement(OLD.id);
    FOR r IN SELECT id FROM public.inventory_cost_entries
              WHERE movement_id = OLD.id AND entry_type = 'reversal' LOOP
      PERFORM public._inv_cost_post_gl(r.id);
    END LOOP;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE')
     AND (s.costing_effective_from IS NULL OR NEW.created_at >= s.costing_effective_from) THEN
    v_entry := public._inv_cost_apply_movement(NEW, s.inventory_valuation_method);
    IF v_entry IS NOT NULL THEN
      PERFORM public._inv_cost_writeback(v_entry);
      PERFORM public._inv_cost_post_gl(v_entry);
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._inv_cost_prepare_accounts(_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object(
    'inventory', public._inv_cost_account(_owner, 'inventory'),
    'cogs', public._inv_cost_account(_owner, 'cogs'),
    'variance', public._inv_cost_account(_owner, 'variance'),
    'purchases', public._inv_cost_account(_owner, 'purchases'),
    'purchase_returns', public._inv_cost_account(_owner, 'purchase_returns'));
END $$;

REVOKE ALL ON FUNCTION public._inv_cost_account(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inv_cost_post_gl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inv_cost_writeback(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._inv_cost_prepare_accounts(uuid) FROM PUBLIC, anon, authenticated;

DO $PATCH$
DECLARE v text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p WHERE p.proname = 'complete_pos_order' AND p.pronamespace = 'public'::regnamespace;
  IF position($O$v_total_paid NUMERIC := 0; v_total_cogs NUMERIC := 0;$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in complete_pos_order'; END IF;
  v := replace(v, $O$v_total_paid NUMERIC := 0; v_total_cogs NUMERIC := 0;$O$, $N$v_total_paid NUMERIC := 0; v_total_cogs NUMERIC := 0; v_cost_mode TEXT;$N$);
  IF position($O$  v_discount_acc  := public._pos_resolve_discount_acc(p_user_id, v_terminal.discount_account_code);
$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in complete_pos_order'; END IF;
  v := replace(v, $O$  v_discount_acc  := public._pos_resolve_discount_acc(p_user_id, v_terminal.discount_account_code);
$O$, $N$  v_discount_acc  := public._pos_resolve_discount_acc(p_user_id, v_terminal.discount_account_code);
  -- Inventory costing engine: leaf accounts + periodic means no COGS at sale
  v_cost_mode := public._inv_cost_mode(p_user_id);
  IF v_cost_mode IS NOT NULL THEN
    v_inventory_acc := public._inv_cost_account(p_user_id, 'inventory');
    v_cogs_acc      := public._inv_cost_account(p_user_id, 'cogs');
    IF v_cost_mode = 'periodic' THEN v_disable_cogs := true; END IF;
  END IF;
$N$);
  IF position($O$  IF NOT v_disable_cogs THEN
    SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
    FROM public.pos_order_lines WHERE order_id = p_order_id;
  END IF;

  IF NOT v_disable_stock THEN
    PERFORM public._pos_sync_stock_movements(p_order_id, p_user_id, false);
  END IF;
$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in complete_pos_order'; END IF;
  v := replace(v, $O$  IF NOT v_disable_cogs THEN
    SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
    FROM public.pos_order_lines WHERE order_id = p_order_id;
  END IF;

  IF NOT v_disable_stock THEN
    PERFORM public._pos_sync_stock_movements(p_order_id, p_user_id, false);
  END IF;
$O$, $N$  -- Stock first so the costing engine prices each line before COGS is summed.
  IF NOT v_disable_stock THEN
    PERFORM public._pos_sync_stock_movements(p_order_id, p_user_id, false);
  END IF;

  IF NOT v_disable_cogs THEN
    IF v_cost_mode = 'perpetual' AND NOT v_disable_stock THEN
      SELECT COALESCE(SUM(e.total_cost), 0) INTO v_total_cogs
      FROM public.inventory_cost_entries e
      JOIN public.pos_order_lines l ON l.id = e.reference_id
      WHERE l.order_id = p_order_id AND e.reference_type = 'pos_order_line_sale'
        AND e.entry_type = 'out' AND e.reversed_at IS NULL;
    ELSE
      SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
      FROM public.pos_order_lines WHERE order_id = p_order_id;
    END IF;
  END IF;
$N$);
  EXECUTE v;
  SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p WHERE p.proname = 'process_pos_return' AND p.pronamespace = 'public'::regnamespace;
  IF position($O$v_total_vat NUMERIC := 0; v_total_cogs NUMERIC := 0;$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in process_pos_return'; END IF;
  v := replace(v, $O$v_total_vat NUMERIC := 0; v_total_cogs NUMERIC := 0;$O$, $N$v_total_vat NUMERIC := 0; v_total_cogs NUMERIC := 0; v_cost_mode TEXT; v_cost_cogs_acc TEXT;$N$);
  IF position($O$  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in process_pos_return'; END IF;
  v := replace(v, $O$  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
$O$, $N$  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
  v_cost_mode := public._inv_cost_mode(p_user_id);
  IF v_cost_mode IS NOT NULL THEN
    v_inventory_acc := public._inv_cost_account(p_user_id, 'inventory');
    v_cost_cogs_acc := public._inv_cost_account(p_user_id, 'cogs');
    IF v_cost_mode = 'periodic' THEN v_disable_cogs := true; END IF;
  END IF;
$N$);
  IF position($O$  IF NOT v_disable_stock THEN PERFORM public._pos_sync_stock_movements(v_return_order_id, p_user_id, true); END IF;
$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in process_pos_return'; END IF;
  v := replace(v, $O$  IF NOT v_disable_stock THEN PERFORM public._pos_sync_stock_movements(v_return_order_id, p_user_id, true); END IF;
$O$, $N$  IF NOT v_disable_stock THEN PERFORM public._pos_sync_stock_movements(v_return_order_id, p_user_id, true); END IF;
  IF v_cost_mode = 'perpetual' AND NOT v_disable_stock THEN
    SELECT COALESCE(SUM(e.total_cost), 0) INTO v_total_cogs
    FROM public.inventory_cost_entries e
    JOIN public.pos_order_lines l ON l.id = e.reference_id
    WHERE l.order_id = v_return_order_id AND e.reference_type = 'pos_order_line_return'
      AND e.entry_type = 'in' AND e.reversed_at IS NULL;
  END IF;
$N$);
  IF position($O$v_inventory_acc, COALESCE(v_terminal.cogs_account_code, '5100'),$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in process_pos_return'; END IF;
  v := replace(v, $O$v_inventory_acc, COALESCE(v_terminal.cogs_account_code, '5100'),$O$, $N$v_inventory_acc, COALESCE(v_cost_cogs_acc, v_terminal.cogs_account_code, '5100'),$N$);
  EXECUTE v;
  SELECT pg_get_functiondef(p.oid) INTO v FROM pg_proc p WHERE p.proname = 'initialize_inventory_costing' AND p.pronamespace = 'public'::regnamespace;
  IF position($O$  r record; v_cost numeric;$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in initialize_inventory_costing'; END IF;
  v := replace(v, $O$  r record; v_cost numeric;$O$, $N$  r record; v_cost numeric; v_accounts jsonb;$N$);
  IF position($O$  UPDATE public.company_settings
     SET inventory_system = _system$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in initialize_inventory_costing'; END IF;
  v := replace(v, $O$  UPDATE public.company_settings
     SET inventory_system = _system$O$, $N$  v_accounts := public._inv_cost_prepare_accounts(v_owner);

  UPDATE public.company_settings
     SET inventory_system = _system$N$);
  IF position($O$jsonb_build_object('opening_lines', v_lines, 'opening_value', round(v_value,2)));$O$ IN v) = 0 THEN RAISE EXCEPTION 'patch anchor missing in initialize_inventory_costing'; END IF;
  v := replace(v, $O$jsonb_build_object('opening_lines', v_lines, 'opening_value', round(v_value,2)));$O$, $N$jsonb_build_object('opening_lines', v_lines, 'opening_value', round(v_value,2), 'accounts', v_accounts));$N$);
  EXECUTE v;
END $PATCH$;
