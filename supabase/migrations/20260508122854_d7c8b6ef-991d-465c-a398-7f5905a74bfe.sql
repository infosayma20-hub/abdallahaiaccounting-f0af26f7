-- =====================================================================
-- POS Accounting Integrity Patch (QA-only, NOT auto-applied)
-- 1. Split VAT from POS revenue (revenue posts NET, VAT posts to VAT Output)
-- 2. Mirror POS sales/returns into stock_movements (idempotent)
-- 3. Standardize inventory fallback account to '1140'
-- 4. Reverse VAT on POS returns
-- 5. RPC signatures preserved (complete_pos_order, process_pos_return)
-- 6. No UI changes, no RLS changes, no schema changes
-- =====================================================================

-- Helper: VAT Output account (fallback '2310') -- WILL BE OVERRIDDEN BY V2 BELOW
CREATE OR REPLACE FUNCTION public._pos_vat_output_account(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT account_code FROM public.accounts
      WHERE user_id = p_user_id AND account_code = '2310' LIMIT 1),
    '2310'
  );
$$;

-- Helper: idempotent stock_movements writer (delete + reinsert per order) -- WILL BE OVERRIDDEN BY V2 BELOW
CREATE OR REPLACE FUNCTION public._pos_sync_stock_movements(
  p_order_id uuid, p_user_id uuid, p_is_return boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref_type text := CASE WHEN p_is_return THEN 'pos_return' ELSE 'pos_sale' END;
  v_mvt      text := CASE WHEN p_is_return THEN 'وارد' ELSE 'صادر' END;
  v_warehouse uuid;
  v_branch_id uuid;
BEGIN
  SELECT t.branch_id INTO v_branch_id
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE o.id = p_order_id;

  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse
    FROM public.warehouses
    WHERE user_id = p_user_id AND branch_id = v_branch_id
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  DELETE FROM public.stock_movements
  WHERE user_id = p_user_id
    AND reference_type = v_ref_type
    AND reference_id  = p_order_id;

  INSERT INTO public.stock_movements (
    user_id, product_id, movement_type, quantity,
    reference_type, reference_id, reference_note,
    warehouse_id, unit_cost
  )
  SELECT
    p_user_id, l.product_id, v_mvt::stock_movement_type, l.qty,
    v_ref_type, p_order_id,
    CASE WHEN p_is_return THEN 'POS Return' ELSE 'POS Sale' END,
    v_warehouse, l.cost_price
  FROM public.pos_order_lines l
  WHERE l.order_id = p_order_id
    AND l.product_id IS NOT NULL
    AND l.qty > 0;
END;
$$;

-- complete_pos_order — patched (signature unchanged)
CREATE OR REPLACE FUNCTION public.complete_pos_order(
  p_order_id uuid, p_user_id uuid, p_payments jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_order RECORD; v_line RECORD; v_payment RECORD; v_terminal RECORD;
  v_tx_id UUID; v_total_paid NUMERIC := 0; v_total_cogs NUMERIC := 0;
  v_idempotency TEXT; v_currency TEXT; v_rate NUMERIC; v_foreign_amount NUMERIC;
  v_debit_account TEXT; v_payment_method TEXT; v_employee_account_code TEXT;
  v_disable_cogs BOOLEAN := false; v_disable_stock BOOLEAN := false;
  v_is_foreign BOOLEAN := false; v_box_gl_code TEXT; v_currency_label TEXT;
  v_card_bank_gl TEXT; v_inventory_acc TEXT; v_revenue_acc TEXT; v_cogs_acc TEXT;
  v_vat_acc TEXT; v_net_total NUMERIC := 0; v_vat_total NUMERIC := 0;
BEGIN
  SELECT o.*, s.terminal_id, s.cash_box_id INTO v_order
  FROM public.pos_orders o JOIN public.pos_sessions s ON s.id = o.session_id
  WHERE o.id = p_order_id AND o.user_id = p_user_id;

  IF v_order IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود'); END IF;
  IF v_order.state = 'paid' THEN RETURN jsonb_build_object('success', true, 'duplicate', true); END IF;

  SELECT COALESCE(cs.pos_disable_cogs, false), COALESCE(cs.pos_disable_stock_deduction, false)
  INTO v_disable_cogs, v_disable_stock
  FROM public.company_settings cs WHERE cs.user_id = p_user_id;

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = p_user_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_order.terminal_id;

  IF v_order.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_order.cash_box_id;
  END IF;
  v_box_gl_code   := COALESCE(v_box_gl_code, COALESCE(v_terminal.cash_account_code, '1110'));
  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
  v_revenue_acc   := COALESCE(v_terminal.revenue_account_code, '4100');
  v_cogs_acc      := COALESCE(v_terminal.cogs_account_code, '5100');
  v_vat_acc       := public._pos_vat_output_account(p_user_id);

  v_idempotency    := 'POS-ORDER-' || p_order_id::TEXT;
  v_currency       := COALESCE(p_payments->0->>'currency', 'ILS');
  v_rate           := COALESCE((p_payments->0->>'exchange_rate')::NUMERIC, 1);
  v_foreign_amount := COALESCE((p_payments->0->>'foreign_amount')::NUMERIC, v_order.total);
  v_payment_method := COALESCE(p_payments->0->>'method', 'cash');
  v_employee_account_code := p_payments->0->>'employee_account_code';
  v_is_foreign := (v_currency != 'ILS' AND v_payment_method NOT IN ('credit', 'card', 'employee_account'));

  v_currency_label := CASE v_currency
    WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو'
    WHEN 'EGP' THEN 'جنيه' WHEN 'ILS' THEN 'شيكل' ELSE v_currency END;

  IF v_payment_method = 'credit' THEN v_debit_account := '1130';
  ELSIF v_payment_method = 'card' THEN
    v_debit_account := COALESCE(p_payments->0->>'visa_gl_account_code', v_card_bank_gl, '1120');
  ELSIF v_payment_method = 'employee_account' THEN
    v_debit_account := COALESCE(v_employee_account_code, '2180');
  ELSE v_debit_account := v_box_gl_code; END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.pos_payments (
      user_id, order_id, payment_method, amount, tendered, change_amount,
      currency, reference, change_currency, exchange_rate
    ) VALUES (
      p_user_id, p_order_id,
      COALESCE(v_payment.value->>'method', 'cash'),
      COALESCE((v_payment.value->>'amount')::NUMERIC, 0),
      COALESCE((v_payment.value->>'tendered')::NUMERIC, 0),
      COALESCE((v_payment.value->>'change')::NUMERIC, 0),
      v_currency, v_payment.value->>'reference',
      COALESCE(v_payment.value->>'change_currency', 'ILS'),
      COALESCE((v_payment.value->>'exchange_rate')::NUMERIC, 1)
    );
    v_total_paid := v_total_paid + COALESCE((v_payment.value->>'amount')::NUMERIC, 0);
  END LOOP;

  IF NOT v_disable_cogs THEN
    SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
    FROM public.pos_order_lines WHERE order_id = p_order_id;
  END IF;

  IF NOT v_disable_stock THEN
    FOR v_line IN SELECT * FROM public.pos_order_lines WHERE order_id = p_order_id LOOP
      IF v_line.product_id IS NOT NULL THEN
        UPDATE public.products SET quantity = quantity - v_line.qty
        WHERE id = v_line.product_id AND user_id = p_user_id;
      END IF;
    END LOOP;
    PERFORM public._pos_sync_stock_movements(p_order_id, p_user_id, false);
  END IF;

  -- VAT split from lines (authoritative); fallback to order-level tax_amount
  SELECT
    COALESCE(SUM(GREATEST(total - COALESCE(tax_amount,0), 0)), 0),
    COALESCE(SUM(COALESCE(tax_amount,0)), 0)
  INTO v_net_total, v_vat_total
  FROM public.pos_order_lines WHERE order_id = p_order_id;

  IF v_vat_total = 0 AND COALESCE(v_order.tax_amount, 0) > 0 THEN
    v_vat_total := v_order.tax_amount;
    v_net_total := v_order.total - v_order.tax_amount;
  END IF;

  -- 1) REVENUE (NET, VAT excluded)
  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key,
    foreign_amount, exchange_rate
  ) VALUES (
    p_user_id, CURRENT_DATE,
    'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number, '') ||
      CASE WHEN v_is_foreign THEN ' (' || v_currency || ')' ELSE '' END,
    v_debit_account, v_revenue_acc,
    GREATEST(v_order.total - v_vat_total, 0),
    v_currency_label, 'pos_sale', v_order.customer_id, v_order.order_number,
    v_payment_method, v_idempotency,
    CASE WHEN v_is_foreign THEN v_foreign_amount ELSE NULL END,
    CASE WHEN v_is_foreign THEN v_rate ELSE NULL END
  ) RETURNING id INTO v_tx_id;

  -- 2) VAT OUTPUT (separate posting)
  IF v_vat_total > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'ضريبة قيمة مضافة (مخرجات) - POS ' || COALESCE(v_order.order_number, ''),
      v_debit_account, v_vat_acc,
      v_vat_total, v_currency_label, 'pos_sale_vat', v_order.customer_id,
      v_order.order_number, v_payment_method, v_idempotency || '-VAT'
    );
  END IF;

  -- 3) COGS
  IF v_total_cogs > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'تكلفة البضاعة المباعة - POS ' || COALESCE(v_order.order_number, ''),
      v_cogs_acc, v_inventory_acc,
      v_total_cogs, 'شيكل', 'pos_cogs',
      v_order.order_number, v_idempotency || '-COGS'
    );
  END IF;

  UPDATE public.pos_orders
  SET state = 'paid', paid_at = NOW(),
      order_number = COALESCE(order_number, (
        SELECT 'POS-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
               LPAD((COALESCE(MAX(
                 CASE WHEN order_number ~ ('^POS-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-[0-9]+$')
                 THEN SUBSTRING(order_number FROM '[0-9]+$')::INT END
               ), 0) + 1)::TEXT, 4, '0')
        FROM public.pos_orders WHERE user_id = p_user_id AND state = 'paid'
      )),
      transaction_id = v_tx_id
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_number', (SELECT order_number FROM public.pos_orders WHERE id = p_order_id),
    'transaction_id', v_tx_id,
    'net_amount', GREATEST(v_order.total - v_vat_total, 0),
    'vat_amount', v_vat_total
  );
END;
$function$;

-- process_pos_return — patched (signature unchanged)
CREATE OR REPLACE FUNCTION public.process_pos_return(
  p_original_order_id uuid, p_user_id uuid, p_session_id uuid, p_items jsonb,
  p_return_currency text DEFAULT 'ILS', p_return_exchange_rate numeric DEFAULT 1,
  p_reason text DEFAULT NULL, p_payment_method text DEFAULT 'cash'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_original RECORD; v_session RECORD; v_terminal RECORD;
  v_return_order_id UUID; v_return_order_number TEXT; v_item JSONB;
  v_total_return NUMERIC := 0; v_total_net NUMERIC := 0;
  v_total_vat NUMERIC := 0; v_total_cogs NUMERIC := 0;
  v_disable_cogs BOOLEAN := false; v_disable_stock BOOLEAN := false;
  v_credit_account TEXT; v_box_gl_code TEXT; v_card_bank_gl TEXT;
  v_currency_label TEXT; v_idempotency TEXT; v_tx_id UUID;
  v_inventory_acc TEXT; v_returns_acc TEXT; v_vat_acc TEXT;
  v_item_total NUMERIC; v_item_tax NUMERIC;
BEGIN
  SELECT o.*, s.cash_box_id, s.terminal_id INTO v_original
  FROM public.pos_orders o JOIN public.pos_sessions s ON s.id = o.session_id
  WHERE o.id = p_original_order_id AND o.user_id = p_user_id;

  IF v_original IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'الفاتورة الأصلية غير موجودة'); END IF;
  IF v_original.state != 'paid' THEN RETURN jsonb_build_object('success', false, 'error', 'لا يمكن ارتجاع فاتورة غير مدفوعة'); END IF;
  IF v_original.is_return THEN RETURN jsonb_build_object('success', false, 'error', 'لا يمكن ارتجاع فاتورة مرتجع'); END IF;

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'الوردية غير موجودة'); END IF;

  SELECT COALESCE(cs.pos_disable_cogs, false), COALESCE(cs.pos_disable_stock_deduction, false)
  INTO v_disable_cogs, v_disable_stock
  FROM public.company_settings cs WHERE cs.user_id = p_user_id;

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = p_user_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_session.cash_box_id;
  END IF;
  IF v_box_gl_code IS NULL AND v_session.terminal_id IS NOT NULL THEN
    SELECT cash_account_code INTO v_box_gl_code FROM public.pos_terminals WHERE id = v_session.terminal_id;
  END IF;
  v_box_gl_code := COALESCE(v_box_gl_code, '1110');

  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;
  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
  v_returns_acc   := COALESCE(
    (SELECT account_code FROM public.accounts WHERE user_id = p_user_id AND account_code = '4150' LIMIT 1),
    COALESCE(v_terminal.revenue_account_code, '4100')
  );
  v_vat_acc := public._pos_vat_output_account(p_user_id);

  IF p_payment_method = 'card' THEN v_credit_account := v_card_bank_gl;
  ELSIF p_payment_method = 'credit' THEN v_credit_account := '1130';
  ELSE v_credit_account := v_box_gl_code; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_total := COALESCE((v_item->>'total')::NUMERIC, 0);
    v_item_tax   := COALESCE((v_item->>'tax_amount')::NUMERIC, 0);
    v_total_return := v_total_return + v_item_total;
    v_total_vat    := v_total_vat    + v_item_tax;
    v_total_cogs   := v_total_cogs   +
      COALESCE((v_item->>'cost_price')::NUMERIC, 0) * COALESCE((v_item->>'qty')::NUMERIC, 0);
  END LOOP;
  v_total_net := GREATEST(v_total_return - v_total_vat, 0);

  IF v_total_return <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'قيمة الارتجاع يجب أن تكون أكبر من صفر');
  END IF;

  v_return_order_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
    LPAD((COALESCE((
      SELECT MAX(SUBSTRING(order_number FROM '[0-9]+$')::INT)
      FROM public.pos_orders
      WHERE user_id = p_user_id AND is_return = true
        AND order_number ~ ('^RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-[0-9]+$')
    ), 0) + 1)::TEXT, 4, '0');

  INSERT INTO public.pos_orders (
    user_id, session_id, terminal_id, customer_id, customer_name,
    subtotal, tax_amount, discount_amount, total,
    state, is_return, original_order_id, order_number,
    return_reason, return_currency, return_exchange_rate, return_currency_amount,
    payment_currency, payment_currency_rate, payment_currency_amount,
    paid_at, created_at
  ) VALUES (
    p_user_id, p_session_id, v_session.terminal_id, v_original.customer_id, v_original.customer_name,
    v_total_net, v_total_vat, 0, v_total_return,
    'paid', true, p_original_order_id, v_return_order_number,
    p_reason, p_return_currency, p_return_exchange_rate,
    CASE WHEN p_return_currency != 'ILS' THEN v_total_return / NULLIF(p_return_exchange_rate, 0) ELSE v_total_return END,
    p_return_currency, p_return_exchange_rate,
    CASE WHEN p_return_currency != 'ILS' THEN v_total_return / NULLIF(p_return_exchange_rate, 0) ELSE v_total_return END,
    NOW(), NOW()
  ) RETURNING id INTO v_return_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.pos_order_lines (
      order_id, user_id, product_id, product_name,
      qty, unit_price, cost_price,
      subtotal, total, discount_amount, tax_amount
    ) VALUES (
      v_return_order_id, p_user_id,
      (v_item->>'product_id')::UUID, v_item->>'product_name',
      COALESCE((v_item->>'qty')::NUMERIC, 0),
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'cost_price')::NUMERIC, 0),
      GREATEST(COALESCE((v_item->>'total')::NUMERIC,0) - COALESCE((v_item->>'tax_amount')::NUMERIC,0), 0),
      COALESCE((v_item->>'total')::NUMERIC, 0),
      0,
      COALESCE((v_item->>'tax_amount')::NUMERIC, 0)
    );

    IF NOT v_disable_stock AND (v_item->>'product_id') IS NOT NULL THEN
      UPDATE public.products
      SET quantity = quantity + COALESCE((v_item->>'qty')::NUMERIC, 0)
      WHERE id = (v_item->>'product_id')::UUID AND user_id = p_user_id;
    END IF;
  END LOOP;

  IF NOT v_disable_stock THEN
    PERFORM public._pos_sync_stock_movements(v_return_order_id, p_user_id, true);
  END IF;

  INSERT INTO public.pos_payments (
    user_id, order_id, payment_method, amount, tendered, change_amount,
    currency, exchange_rate
  ) VALUES (
    p_user_id, v_return_order_id, p_payment_method, v_total_return, v_total_return, 0,
    p_return_currency, p_return_exchange_rate
  );

  v_currency_label := CASE p_return_currency
    WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار'
    WHEN 'EUR' THEN 'يورو' WHEN 'EGP' THEN 'جنيه' ELSE 'شيكل' END;

  v_idempotency := 'POS-RETURN-' || v_return_order_id::TEXT;

  -- 1) Reverse Sales (NET)
  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id,
    reference, payment_method, idempotency_key,
    foreign_amount, exchange_rate
  ) VALUES (
    p_user_id, CURRENT_DATE,
    'مرتجع مبيعات نقطة البيع - ' || v_return_order_number ||
      ' (مرجع: ' || COALESCE(v_original.order_number, '') || ')',
    v_returns_acc, v_credit_account, v_total_net,
    v_currency_label, 'pos_return', v_original.customer_id,
    v_return_order_number, p_payment_method, v_idempotency,
    CASE WHEN p_return_currency != 'ILS' THEN v_total_net / NULLIF(p_return_exchange_rate, 0) ELSE NULL END,
    CASE WHEN p_return_currency != 'ILS' THEN p_return_exchange_rate ELSE NULL END
  ) RETURNING id INTO v_tx_id;

  -- 2) Reverse VAT Output
  IF v_total_vat > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'عكس ضريبة قيمة مضافة (مخرجات) - مرتجع ' || v_return_order_number,
      v_vat_acc, v_credit_account, v_total_vat,
      v_currency_label, 'pos_return_vat', v_original.customer_id,
      v_return_order_number, p_payment_method, v_idempotency || '-VAT'
    );
  END IF;

  -- 3) Reverse COGS
  IF v_total_cogs > 0 AND NOT v_disable_cogs THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'عكس تكلفة البضاعة - مرتجع ' || v_return_order_number,
      v_inventory_acc, COALESCE(v_terminal.cogs_account_code, '5100'),
      v_total_cogs, 'شيكل', 'pos_return_cogs',
      v_return_order_number, v_idempotency || '-COGS'
    );
  END IF;

  UPDATE public.pos_orders SET transaction_id = v_tx_id WHERE id = v_return_order_id;
  UPDATE public.pos_sessions
    SET total_returns = COALESCE(total_returns, 0) + v_total_return
    WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_order_id', v_return_order_id,
    'return_order_number', v_return_order_number,
    'total_returned', v_total_return,
    'net_amount', v_total_net,
    'vat_amount', v_total_vat,
    'transaction_id', v_tx_id
  );
END;
$function$;

-- =====================================================================
-- V2 CORRECTIONS — overrides helpers + adds line-level idempotency index
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_pos_order_line_idem
  ON public.stock_movements (reference_type, reference_id)
  WHERE reference_type IN ('pos_order_line_sale', 'pos_order_line_return')
    AND reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._pos_vat_output_account(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(output_tax_account_code, '')
       FROM public.tax_settings
       WHERE user_id = p_user_id AND COALESCE(is_active, true) = true
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 1),
    (SELECT NULLIF(vat_sales_account, '')
       FROM public.company_settings
       WHERE user_id = p_user_id
       LIMIT 1),
    (SELECT account_code
       FROM public.accounts
       WHERE user_id = p_user_id
         AND system_role = 'vat_output'
         AND COALESCE(is_active, true) = true
       ORDER BY account_code
       LIMIT 1),
    '2190'
  );
$$;

CREATE OR REPLACE FUNCTION public._pos_sync_stock_movements(
  p_order_id uuid, p_user_id uuid, p_is_return boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref_type text := CASE WHEN p_is_return
                          THEN 'pos_order_line_return'
                          ELSE 'pos_order_line_sale' END;
  v_mvt      text := CASE WHEN p_is_return THEN 'وارد' ELSE 'صادر' END;
  v_warehouse uuid;
  v_branch_id uuid;
BEGIN
  SELECT t.branch_id INTO v_branch_id
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  JOIN public.pos_terminals t ON t.id = s.terminal_id
  WHERE o.id = p_order_id;

  IF v_branch_id IS NOT NULL THEN
    SELECT id INTO v_warehouse
    FROM public.warehouses
    WHERE user_id = p_user_id AND branch_id = v_branch_id
    ORDER BY is_default DESC NULLS LAST, created_at ASC
    LIMIT 1;
  END IF;

  INSERT INTO public.stock_movements (
    user_id, product_id, movement_type, quantity,
    reference_type, reference_id, reference_note,
    warehouse_id, unit_cost
  )
  SELECT
    p_user_id, l.product_id, v_mvt::stock_movement_type, l.qty,
    v_ref_type, l.id,
    CASE WHEN p_is_return THEN 'POS Return' ELSE 'POS Sale' END,
    v_warehouse, l.cost_price
  FROM public.pos_order_lines l
  WHERE l.order_id = p_order_id
    AND l.product_id IS NOT NULL
    AND l.qty > 0
  ON CONFLICT (reference_type, reference_id) DO NOTHING;
END;
$$;