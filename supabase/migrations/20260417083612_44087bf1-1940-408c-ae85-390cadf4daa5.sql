-- 1) Add columns to track return currency and link to original order
ALTER TABLE public.pos_orders 
  ADD COLUMN IF NOT EXISTS return_currency TEXT,
  ADD COLUMN IF NOT EXISTS return_exchange_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS return_currency_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS original_order_id UUID REFERENCES public.pos_orders(id);

CREATE INDEX IF NOT EXISTS idx_pos_orders_original_order_id ON public.pos_orders(original_order_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_is_return_session ON public.pos_orders(session_id, is_return);

-- 2) Function: process a return (partial or full) with proper accounting
CREATE OR REPLACE FUNCTION public.process_pos_return(
  p_original_order_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_items JSONB,           -- array: [{line_id, qty, unit_price, cost_price, product_id, product_name, total}]
  p_return_currency TEXT DEFAULT 'ILS',
  p_return_exchange_rate NUMERIC DEFAULT 1,
  p_reason TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_original RECORD;
  v_session RECORD;
  v_return_order_id UUID;
  v_return_order_number TEXT;
  v_item JSONB;
  v_total_return NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
  v_disable_cogs BOOLEAN := false;
  v_disable_stock BOOLEAN := false;
  v_credit_account TEXT;
  v_box_gl_code TEXT;
  v_card_bank_gl TEXT;
  v_currency_label TEXT;
  v_idempotency TEXT;
  v_tx_id UUID;
  v_orig_payment RECORD;
  v_orig_currency TEXT;
  v_orig_rate NUMERIC;
  v_fx_diff NUMERIC := 0;
  v_return_ils NUMERIC;
  v_orig_ils_per_unit NUMERIC;
BEGIN
  -- Load original order
  SELECT o.*, s.cash_box_id, s.terminal_id INTO v_original
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  WHERE o.id = p_original_order_id AND o.user_id = p_user_id;

  IF v_original IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة الأصلية غير موجودة');
  END IF;

  IF v_original.state != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن ارتجاع فاتورة غير مدفوعة');
  END IF;

  IF v_original.is_return THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن ارتجاع فاتورة مرتجع');
  END IF;

  -- Load current session for box info
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الوردية غير موجودة');
  END IF;

  -- Settings
  SELECT COALESCE(cs.pos_disable_cogs, false), COALESCE(cs.pos_disable_stock_deduction, false)
  INTO v_disable_cogs, v_disable_stock
  FROM public.company_settings cs
  WHERE cs.user_id = p_user_id;

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = p_user_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  -- Box GL
  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_session.cash_box_id;
  END IF;
  IF v_box_gl_code IS NULL AND v_session.terminal_id IS NOT NULL THEN
    SELECT cash_account_code INTO v_box_gl_code FROM public.pos_terminals WHERE id = v_session.terminal_id;
  END IF;
  v_box_gl_code := COALESCE(v_box_gl_code, '1110');

  -- Original payment info (for FX diff calculation)
  SELECT currency, exchange_rate, payment_method INTO v_orig_payment
  FROM public.pos_payments
  WHERE order_id = p_original_order_id
  ORDER BY created_at ASC
  LIMIT 1;

  v_orig_currency := COALESCE(v_orig_payment.currency, 'ILS');
  v_orig_rate := COALESCE(v_orig_payment.exchange_rate, 1);

  -- Determine credit account based on refund payment method
  IF p_payment_method = 'card' THEN
    v_credit_account := v_card_bank_gl;
  ELSIF p_payment_method = 'credit' THEN
    v_credit_account := '1130';  -- Receivables
  ELSE
    v_credit_account := v_box_gl_code;  -- Cash refund
  END IF;

  -- Calculate totals from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total_return := v_total_return + COALESCE((v_item->>'total')::NUMERIC, 0);
    v_total_cogs := v_total_cogs + 
      COALESCE((v_item->>'cost_price')::NUMERIC, 0) * COALESCE((v_item->>'qty')::NUMERIC, 0);
  END LOOP;

  IF v_total_return <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'قيمة الارتجاع يجب أن تكون أكبر من صفر');
  END IF;

  -- Generate return order number
  v_return_order_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
    LPAD((COALESCE((
      SELECT MAX(SUBSTRING(order_number FROM '[0-9]+$')::INT)
      FROM public.pos_orders
      WHERE user_id = p_user_id 
        AND is_return = true
        AND order_number ~ ('^RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-[0-9]+$')
    ), 0) + 1)::TEXT, 4, '0');

  -- Create the return order
  INSERT INTO public.pos_orders (
    user_id, session_id, terminal_id, customer_id, customer_name,
    subtotal, tax_amount, discount_amount, total,
    state, is_return, original_order_id, order_number,
    return_reason, return_currency, return_exchange_rate, return_currency_amount,
    payment_currency, payment_currency_rate, payment_currency_amount,
    paid_at, created_at
  ) VALUES (
    p_user_id, p_session_id, v_session.terminal_id, v_original.customer_id, v_original.customer_name,
    v_total_return, 0, 0, v_total_return,
    'paid', true, p_original_order_id, v_return_order_number,
    p_reason, p_return_currency, p_return_exchange_rate,
    CASE WHEN p_return_currency != 'ILS' THEN v_total_return / NULLIF(p_return_exchange_rate, 0) ELSE v_total_return END,
    p_return_currency, p_return_exchange_rate,
    CASE WHEN p_return_currency != 'ILS' THEN v_total_return / NULLIF(p_return_exchange_rate, 0) ELSE v_total_return END,
    NOW(), NOW()
  ) RETURNING id INTO v_return_order_id;

  -- Create return order lines
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.pos_order_lines (
      order_id, user_id, product_id, product_name,
      qty, unit_price, cost_price, subtotal, total, discount_amount
    ) VALUES (
      v_return_order_id, p_user_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      COALESCE((v_item->>'qty')::NUMERIC, 0),
      COALESCE((v_item->>'unit_price')::NUMERIC, 0),
      COALESCE((v_item->>'cost_price')::NUMERIC, 0),
      COALESCE((v_item->>'total')::NUMERIC, 0),
      COALESCE((v_item->>'total')::NUMERIC, 0),
      0
    );

    -- Return stock
    IF NOT v_disable_stock AND (v_item->>'product_id') IS NOT NULL THEN
      UPDATE public.products 
      SET quantity = quantity + COALESCE((v_item->>'qty')::NUMERIC, 0)
      WHERE id = (v_item->>'product_id')::UUID AND user_id = p_user_id;
    END IF;
  END LOOP;

  -- Create payment record (negative)
  INSERT INTO public.pos_payments (
    user_id, order_id, payment_method, amount, tendered, change_amount,
    currency, exchange_rate
  ) VALUES (
    p_user_id, v_return_order_id, p_payment_method, v_total_return, v_total_return, 0,
    p_return_currency, p_return_exchange_rate
  );

  -- Currency label
  v_currency_label := CASE p_return_currency
    WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار'
    WHEN 'EUR' THEN 'يورو' WHEN 'EGP' THEN 'جنيه'
    ELSE 'شيكل'
  END;

  v_idempotency := 'POS-RETURN-' || v_return_order_id::TEXT;

  -- REVERSE SALE ENTRY: Debit Sales Returns (or Sales 4100), Credit Cash/Bank/AR
  -- Standard: Debit Sales Returns (4150) Credit Cash (1110)
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
    COALESCE((SELECT account_code FROM public.accounts WHERE user_id = p_user_id AND account_code = '4150' LIMIT 1), '4100'),
    v_credit_account,
    v_total_return,
    v_currency_label,
    'pos_return',
    v_original.customer_id,
    v_return_order_number,
    p_payment_method,
    v_idempotency,
    CASE WHEN p_return_currency != 'ILS' THEN v_total_return / NULLIF(p_return_exchange_rate, 0) ELSE NULL END,
    CASE WHEN p_return_currency != 'ILS' THEN p_return_exchange_rate ELSE NULL END
  ) RETURNING id INTO v_tx_id;

  -- REVERSE COGS: Debit Inventory, Credit COGS
  IF v_total_cogs > 0 AND NOT v_disable_cogs THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'عكس تكلفة البضاعة - مرتجع ' || v_return_order_number,
      '1140',  -- Inventory
      '5100',  -- COGS
      v_total_cogs, 'شيكل', 'pos_return_cogs',
      v_return_order_number, v_idempotency || '-COGS'
    );
  END IF;

  -- Update return order with transaction id
  UPDATE public.pos_orders SET transaction_id = v_tx_id WHERE id = v_return_order_id;

  -- Update session totals
  UPDATE public.pos_sessions
  SET total_returns = COALESCE(total_returns, 0) + v_total_return
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'return_order_id', v_return_order_id,
    'return_order_number', v_return_order_number,
    'total_returned', v_total_return,
    'transaction_id', v_tx_id
  );
END;
$function$;