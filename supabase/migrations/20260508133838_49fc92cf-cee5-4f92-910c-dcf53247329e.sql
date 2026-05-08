CREATE OR REPLACE FUNCTION public.process_pos_return(p_original_order_id uuid, p_user_id uuid, p_session_id uuid, p_items jsonb, p_return_currency text DEFAULT 'ILS'::text, p_return_exchange_rate numeric DEFAULT 1, p_reason text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    user_id, company_id, session_id, customer_id, customer_name,
    subtotal, tax_amount, discount_amount, total,
    state, is_return, original_order_id, order_number,
    return_reason, return_currency, return_exchange_rate, return_currency_amount,
    payment_currency, payment_currency_rate, payment_currency_amount,
    paid_at, created_at
  ) VALUES (
    p_user_id, v_original.company_id, p_session_id, v_original.customer_id, v_original.customer_name,
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