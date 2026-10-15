ALTER TABLE public.pos_user_permissions ADD COLUMN IF NOT EXISTS can_pos_return boolean NOT NULL DEFAULT false;
ALTER TABLE public.pos_order_lines ADD COLUMN IF NOT EXISTS return_disposition text;
COMMENT ON COLUMN public.pos_order_lines.return_disposition IS 'Return lines only: restock | damaged';

CREATE OR REPLACE FUNCTION public.pos_return_v2(
  p_original_order_id uuid, p_session_id uuid, p_items jsonb, p_reason text,
  p_payment_method text DEFAULT 'cash', p_return_currency text DEFAULT 'ILS', p_return_exchange_rate numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  o RECORD; v_session RECORD; v_terminal RECORD; l RECORD; v_item jsonb;
  v_owner uuid; v_allowed boolean := false; v_pos_user uuid;
  v_ratio numeric := 1; v_lines_sum numeric; v_prev_total numeric;
  v_ret_id uuid; v_ret_no text; v_line_id uuid;
  v_qty numeric; v_prev_qty numeric; v_unit numeric; v_unit_tax numeric; v_disp text;
  v_total numeric := 0; v_vat numeric := 0; v_net numeric; v_cogs numeric := 0; v_damage_cost numeric := 0;
  v_disable_cogs boolean; v_disable_stock boolean; v_cost_mode text; v_cost_cogs_acc text;
  v_inv_acc text; v_ret_acc text; v_vat_acc text; v_box_gl text; v_credit text; v_damage_acc text;
  v_orig_methods text[]; v_orig_debit text; v_cur_label text; v_idem text; v_tx uuid; v_warehouse uuid;
  v_method text := COALESCE(NULLIF(p_payment_method,''),'cash');
  v_damaged_names text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF length(trim(COALESCE(p_reason,''))) < 3 THEN RAISE EXCEPTION 'سبب الإرجاع إلزامي'; END IF;

  SELECT * INTO o FROM public.pos_orders WHERE id = p_original_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة الأصلية غير موجودة'; END IF;
  v_owner := o.user_id;
  IF o.state <> 'paid' THEN RAISE EXCEPTION 'لا يمكن إرجاع فاتورة غير مدفوعة'; END IF;
  IF COALESCE(o.is_return,false) THEN RAISE EXCEPTION 'لا يمكن إرجاع فاتورة مرتجع'; END IF;

  -- Permission: tenant owner, tenant admin, or POS user with can_pos_return
  IF v_uid = v_owner OR (public.is_team_member(v_uid, v_owner) AND public.has_role(v_uid,'admin')) THEN
    v_allowed := true;
  ELSE
    SELECT pu.id INTO v_pos_user FROM public.pos_users pu
      JOIN public.pos_user_permissions pp ON pp.pos_user_id = pu.id
     WHERE pu.auth_user_id = v_uid AND pu.user_id = v_owner AND COALESCE(pu.is_active,true) AND pp.can_pos_return
     LIMIT 1;
    v_allowed := v_pos_user IS NOT NULL;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'ليس لديك صلاحية مردود المبيعات'; END IF;

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  IF v_session.closed_at IS NOT NULL OR COALESCE(v_session.state,'opened') NOT IN ('opened','open') THEN
    RAISE EXCEPTION 'يجب أن تكون الوردية مفتوحة لتنفيذ الإرجاع';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pos_terminals t WHERE t.id = v_session.terminal_id AND t.user_id = v_owner) THEN
    RAISE EXCEPTION 'الوردية لا تتبع نفس الشركة';
  END IF;

  -- Order-level discount ratio
  SELECT COALESCE(SUM(total),0) INTO v_lines_sum FROM public.pos_order_lines WHERE order_id = o.id;
  IF v_lines_sum > 0 AND COALESCE(o.total,0) < v_lines_sum THEN v_ratio := o.total / v_lines_sum; END IF;

  -- Refund destination
  SELECT array_agg(DISTINCT payment_method) INTO v_orig_methods FROM public.pos_payments
   WHERE order_id = o.id AND COALESCE(is_refund,false) = false;
  IF v_method <> 'cash' THEN
    IF v_orig_methods IS NULL OR array_length(v_orig_methods,1) <> 1 OR v_orig_methods[1] <> v_method THEN
      RAISE EXCEPTION 'الإرجاع بغير الكاش مسموح فقط بنفس طريقة دفع الفاتورة الأصلية';
    END IF;
    SELECT debit_account_code INTO v_orig_debit FROM public.transactions WHERE id = o.transaction_id;
    IF v_orig_debit IS NULL THEN RAISE EXCEPTION 'تعذر تحديد حساب الدفع الأصلي'; END IF;
    v_credit := v_orig_debit;
  END IF;

  SELECT COALESCE(cs.pos_disable_cogs,false), COALESCE(cs.pos_disable_stock_deduction,false)
    INTO v_disable_cogs, v_disable_stock FROM public.company_settings cs WHERE cs.user_id = v_owner;
  v_disable_cogs := COALESCE(v_disable_cogs,false); v_disable_stock := COALESCE(v_disable_stock,false);

  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;
  IF v_session.cash_box_id IS NOT NULL THEN SELECT gl_account_code INTO v_box_gl FROM public.cash_boxes WHERE id = v_session.cash_box_id; END IF;
  v_box_gl := COALESCE(v_box_gl, v_terminal.cash_account_code, '1110');
  IF v_method = 'cash' THEN v_credit := public._pos_resolve_cash_gl(v_session.cash_box_id, p_return_currency, v_box_gl); END IF;

  v_inv_acc := COALESCE(v_terminal.inventory_account_code, '1140');
  v_cost_mode := public._inv_cost_mode(v_owner);
  IF v_cost_mode IS NOT NULL THEN
    v_inv_acc := public._inv_cost_account(v_owner,'inventory');
    v_cost_cogs_acc := public._inv_cost_account(v_owner,'cogs');
    IF v_cost_mode = 'periodic' THEN v_disable_cogs := true; END IF;
  END IF;
  v_ret_acc := COALESCE((SELECT account_code FROM public.accounts WHERE user_id = v_owner AND account_code='4150' LIMIT 1),
                        v_terminal.revenue_account_code, '4100');
  v_vat_acc := public._pos_vat_output_account(v_owner);

  v_ret_no := 'RET-' || to_char(CURRENT_DATE,'YYYYMMDD') || '-' || lpad((COALESCE((
     SELECT MAX(substring(order_number FROM '[0-9]+$')::int) FROM public.pos_orders
      WHERE user_id = v_owner AND is_return = true
        AND order_number ~ ('^RET-' || to_char(CURRENT_DATE,'YYYYMMDD') || '-[0-9]+$')),0)+1)::text, 4, '0');

  INSERT INTO public.pos_orders (user_id, company_id, session_id, customer_id, customer_name,
    subtotal, tax_amount, discount_amount, total, state, is_return, original_order_id, order_number,
    return_reason, return_currency, return_exchange_rate, return_currency_amount,
    payment_currency, payment_currency_rate, payment_currency_amount, paid_at, created_at)
  VALUES (v_owner, o.company_id, p_session_id, o.customer_id, o.customer_name,
    0, 0, 0, 0, 'paid', true, o.id, v_ret_no, trim(p_reason), p_return_currency, p_return_exchange_rate, 0,
    p_return_currency, p_return_exchange_rate, 0, now(), now())
  RETURNING id INTO v_ret_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) LOOP
    SELECT * INTO l FROM public.pos_order_lines WHERE id = (v_item->>'line_id')::uuid AND order_id = o.id;
    IF l.id IS NULL THEN RAISE EXCEPTION 'سطر غير موجود في الفاتورة الأصلية'; END IF;
    v_qty := COALESCE((v_item->>'qty')::numeric,0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    SELECT COALESCE(SUM(rl.qty),0) INTO v_prev_qty FROM public.pos_order_lines rl
      JOIN public.pos_orders ro ON ro.id = rl.order_id
     WHERE ro.original_order_id = o.id AND ro.is_return AND ro.state='paid' AND ro.id <> v_ret_id
       AND COALESCE(rl.product_id::text, rl.product_name) = COALESCE(l.product_id::text, l.product_name);
    SELECT v_prev_qty + COALESCE(SUM(rl.qty),0) INTO v_prev_qty FROM public.pos_order_lines rl
     WHERE rl.order_id = v_ret_id AND COALESCE(rl.product_id::text, rl.product_name) = COALESCE(l.product_id::text, l.product_name);
    IF v_qty > (SELECT COALESCE(SUM(x.qty),0) FROM public.pos_order_lines x WHERE x.order_id = o.id
                 AND COALESCE(x.product_id::text,x.product_name) = COALESCE(l.product_id::text,l.product_name)) - v_prev_qty + 0.0001 THEN
      RAISE EXCEPTION 'الكمية المرتجعة من «%» أكبر من المتبقي', l.product_name;
    END IF;
    v_disp := CASE WHEN v_item->>'disposition' = 'damaged' THEN 'damaged' ELSE 'restock' END;
    v_unit := CASE WHEN l.qty > 0 THEN round(l.total / l.qty * v_ratio, 4) ELSE 0 END;
    v_unit_tax := CASE WHEN l.qty > 0 THEN COALESCE(l.tax_amount,0) / l.qty * v_ratio ELSE 0 END;

    INSERT INTO public.pos_order_lines (order_id, user_id, product_id, product_name, qty, unit_price, cost_price,
      subtotal, total, discount_amount, tax_amount, return_disposition, notes)
    VALUES (v_ret_id, v_owner, l.product_id, l.product_name, v_qty, v_unit, COALESCE(l.cost_price,0),
      round(v_qty*(v_unit - v_unit_tax),2), round(v_qty*v_unit,2), 0, round(v_qty*v_unit_tax,2), v_disp,
      CASE WHEN v_disp='damaged' THEN 'مرتجع تالف' END)
    RETURNING id INTO v_line_id;

    v_total := v_total + round(v_qty*v_unit,2);
    v_vat := v_vat + round(v_qty*v_unit_tax,2);
    v_cogs := v_cogs + COALESCE(l.cost_price,0)*v_qty;
    IF v_disp='damaged' THEN v_damaged_names := v_damaged_names || l.product_name; END IF;
  END LOOP;

  IF v_total <= 0 THEN RAISE EXCEPTION 'اختر صنفًا واحدًا على الأقل بكمية أكبر من صفر'; END IF;
  SELECT COALESCE(SUM(total),0) INTO v_prev_total FROM public.pos_orders
   WHERE original_order_id = o.id AND is_return AND state='paid' AND id <> v_ret_id;
  IF v_prev_total + v_total > o.total + 0.05 THEN RAISE EXCEPTION 'إجمالي المرتجعات يتجاوز قيمة الفاتورة'; END IF;
  v_net := GREATEST(v_total - v_vat, 0);

  UPDATE public.pos_orders SET subtotal = v_net, tax_amount = v_vat, total = v_total,
    return_currency_amount = CASE WHEN p_return_currency <> 'ILS' THEN v_total / NULLIF(p_return_exchange_rate,0) ELSE v_total END,
    payment_currency_amount = CASE WHEN p_return_currency <> 'ILS' THEN v_total / NULLIF(p_return_exchange_rate,0) ELSE v_total END
   WHERE id = v_ret_id;

  -- Stock: everything returns in; damaged lines then go out as write-off
  IF NOT v_disable_stock THEN
    PERFORM public._pos_sync_stock_movements(v_ret_id, v_owner, true);
    SELECT w.id INTO v_warehouse FROM public.warehouses w
     WHERE w.user_id = v_owner AND w.branch_id = v_terminal.branch_id
     ORDER BY w.is_default DESC NULLS LAST, w.created_at ASC LIMIT 1;
    INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, reference_type, reference_id,
      reference_note, warehouse_id, unit_cost, notes)
    SELECT v_owner, rl.product_id, 'صادر'::stock_movement_type, rl.qty, 'pos_return_damage', rl.id,
      'POS Return Damaged ' || v_ret_no, v_warehouse, rl.cost_price, 'تالف من مرتجع ' || v_ret_no
      FROM public.pos_order_lines rl
     WHERE rl.order_id = v_ret_id AND rl.return_disposition='damaged' AND rl.product_id IS NOT NULL AND rl.qty > 0;
  END IF;

  IF v_cost_mode = 'perpetual' AND NOT v_disable_stock THEN
    SELECT COALESCE(SUM(e.total_cost),0) INTO v_cogs FROM public.inventory_cost_entries e
      JOIN public.pos_order_lines rl ON rl.id = e.reference_id
     WHERE rl.order_id = v_ret_id AND e.reference_type='pos_order_line_return' AND e.entry_type='in' AND e.reversed_at IS NULL;
    SELECT COALESCE(SUM(e.total_cost),0) INTO v_damage_cost FROM public.inventory_cost_entries e
      JOIN public.pos_order_lines rl ON rl.id = e.reference_id
     WHERE rl.order_id = v_ret_id AND e.reference_type='pos_return_damage' AND e.entry_type='out' AND e.reversed_at IS NULL;
  ELSE
    SELECT COALESCE(SUM(rl.cost_price*rl.qty),0) INTO v_damage_cost FROM public.pos_order_lines rl
     WHERE rl.order_id = v_ret_id AND rl.return_disposition='damaged' AND rl.product_id IS NOT NULL;
  END IF;

  INSERT INTO public.pos_payments (user_id, order_id, payment_method, amount, tendered, change_amount, currency, exchange_rate, is_refund, refund_reason)
  VALUES (v_owner, v_ret_id, v_method, v_total, v_total, 0, p_return_currency, p_return_exchange_rate, true, trim(p_reason));

  v_cur_label := CASE p_return_currency WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو' ELSE 'شيكل' END;
  v_idem := 'POS-RETURN-' || v_ret_id::text;

  INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id, reference, payment_method, idempotency_key, foreign_amount, exchange_rate)
  VALUES (v_owner, CURRENT_DATE, 'مرتجع مبيعات نقطة البيع - ' || v_ret_no || ' (مرجع: ' || COALESCE(o.order_number,'') || ')',
    v_ret_acc, v_credit, v_net, v_cur_label, 'pos_return', o.customer_id, v_ret_no, v_method, v_idem,
    CASE WHEN p_return_currency <> 'ILS' THEN v_net / NULLIF(p_return_exchange_rate,0) END,
    CASE WHEN p_return_currency <> 'ILS' THEN p_return_exchange_rate END)
  RETURNING id INTO v_tx;

  IF v_vat > 0 THEN
    INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id, reference, payment_method, idempotency_key)
    VALUES (v_owner, CURRENT_DATE, 'عكس ضريبة قيمة مضافة (مخرجات) - مرتجع ' || v_ret_no,
      v_vat_acc, v_credit, v_vat, v_cur_label, 'pos_return_vat', o.customer_id, v_ret_no, v_method, v_idem || '-VAT');
  END IF;

  IF v_cogs > 0 AND NOT v_disable_cogs AND NOT v_disable_stock THEN
    INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key)
    VALUES (v_owner, CURRENT_DATE, 'عكس تكلفة البضاعة - مرتجع ' || v_ret_no,
      v_inv_acc, COALESCE(v_cost_cogs_acc, v_terminal.cogs_account_code, '5100'), round(v_cogs,2), 'شيكل', 'pos_return_cogs', v_ret_no, v_idem || '-COGS');
  END IF;

  IF v_damage_cost > 0 AND NOT v_disable_cogs AND NOT v_disable_stock THEN
    v_damage_acc := public._ensure_named_leaf_account(v_owner, ARRAY['5300','5000'], 'بضاعة تالفة - مرتجعات نقطة البيع');
    INSERT INTO public.transactions (user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, idempotency_key)
    VALUES (v_owner, CURRENT_DATE, 'إتلاف بضاعة مرتجعة - ' || v_ret_no || ' (' || array_to_string(v_damaged_names,'، ') || ')',
      v_damage_acc, v_inv_acc, round(v_damage_cost,2), 'شيكل', 'pos_return_damage', v_ret_no, v_idem || '-DAMAGE');
  END IF;

  UPDATE public.pos_orders SET transaction_id = v_tx WHERE id = v_ret_id;
  UPDATE public.pos_sessions SET total_returns = COALESCE(total_returns,0) + v_total WHERE id = p_session_id;

  BEGIN
    INSERT INTO public.pos_sensitive_actions_log (company_id, action, pos_user_id, session_id, invoice_id, notes, metadata)
    VALUES (v_owner, 'pos_return', v_pos_user, p_session_id, o.id,
      'مرتجع ' || v_ret_no || ' من فاتورة ' || COALESCE(o.order_number,'') || ' — ' || trim(p_reason),
      jsonb_build_object('return_order_id', v_ret_id, 'total', v_total, 'payment_method', v_method,
        'damaged_items', to_jsonb(v_damaged_names), 'by_auth_user', v_uid));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'return_order_id', v_ret_id, 'return_order_number', v_ret_no,
    'total_returned', v_total, 'net_amount', v_net, 'vat_amount', v_vat, 'payment_method', v_method,
    'damaged_cost', round(v_damage_cost,2), 'transaction_id', v_tx);
END $fn$;

REVOKE ALL ON FUNCTION public.pos_return_v2(uuid,uuid,jsonb,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_return_v2(uuid,uuid,jsonb,text,text,text,numeric) TO authenticated;