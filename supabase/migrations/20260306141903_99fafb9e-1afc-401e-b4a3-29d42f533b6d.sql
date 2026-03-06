CREATE OR REPLACE FUNCTION public.complete_pos_order(p_order_id uuid, p_user_id uuid, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_line RECORD;
  v_payment RECORD;
  v_terminal RECORD;
  v_tx_id UUID;
  v_total_paid NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
  v_idempotency TEXT;
  v_currency TEXT;
  v_rate NUMERIC;
  v_foreign_amount NUMERIC;
  v_debit_account TEXT;
  v_rate_diff NUMERIC;
  v_payment_method TEXT;
BEGIN
  -- Get order
  SELECT o.*, s.terminal_id INTO v_order
  FROM public.pos_orders o
  JOIN public.pos_sessions s ON s.id = o.session_id
  WHERE o.id = p_order_id AND o.user_id = p_user_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_order.state = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;

  -- Get terminal config
  SELECT * INTO v_terminal
  FROM public.pos_terminals
  WHERE id = v_order.terminal_id;

  -- Idempotency
  v_idempotency := 'POS-ORDER-' || p_order_id::TEXT;

  -- Extract currency and payment method info from first payment
  v_currency := COALESCE(p_payments->0->>'currency', 'ILS');
  v_rate := COALESCE((p_payments->0->>'exchange_rate')::NUMERIC, 1);
  v_foreign_amount := COALESCE((p_payments->0->>'foreign_amount')::NUMERIC, v_order.total);
  v_payment_method := COALESCE(p_payments->0->>'method', 'cash');

  -- Determine debit account based on payment method and currency
  IF v_payment_method = 'credit' THEN
    -- آجل: debit customer receivables
    v_debit_account := '1130';
  ELSIF v_payment_method = 'card' THEN
    v_debit_account := COALESCE(v_terminal.cash_account_code, '1120');
  ELSIF v_payment_method = 'employee_account' THEN
    v_debit_account := '1180'; -- ذمم موظفين
  ELSE
    -- Cash: determine by currency
    CASE v_currency
      WHEN 'USD' THEN v_debit_account := '1111';
      WHEN 'JOD' THEN v_debit_account := '1112';
      WHEN 'EUR' THEN v_debit_account := '1113';
      WHEN 'EGP' THEN v_debit_account := '1114';
      ELSE v_debit_account := COALESCE(v_terminal.cash_account_code, '1110');
    END CASE;
  END IF;

  -- Insert payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (
      user_id, order_id, payment_method, amount, tendered, change_amount, currency, reference
    ) VALUES (
      p_user_id,
      p_order_id,
      COALESCE(v_payment.value->>'method', 'cash'),
      COALESCE((v_payment.value->>'amount')::NUMERIC, 0),
      COALESCE((v_payment.value->>'tendered')::NUMERIC, 0),
      COALESCE((v_payment.value->>'change')::NUMERIC, 0),
      v_currency,
      v_payment.value->>'reference'
    );
    v_total_paid := v_total_paid + COALESCE((v_payment.value->>'amount')::NUMERIC, 0);
  END LOOP;

  -- Calculate COGS from order lines
  SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
  FROM public.pos_order_lines
  WHERE order_id = p_order_id;

  -- Deduct stock from products
  FOR v_line IN SELECT * FROM public.pos_order_lines WHERE order_id = p_order_id
  LOOP
    IF v_line.product_id IS NOT NULL THEN
      UPDATE public.products
      SET quantity = quantity - v_line.qty
      WHERE id = v_line.product_id AND user_id = p_user_id;
    END IF;
  END LOOP;

  -- Create sales journal entry
  IF v_currency = 'ILS' OR v_payment_method IN ('credit', 'card', 'employee_account') THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number, ''),
      v_debit_account,
      COALESCE(v_terminal.revenue_account_code, '4100'),
      v_order.total,
      'شيكل',
      'pos_sale',
      v_order.customer_id,
      v_order.order_number,
      v_payment_method,
      v_idempotency
    )
    RETURNING id INTO v_tx_id;
  ELSE
    -- Foreign currency entry
    v_rate_diff := (v_foreign_amount * v_rate) - v_order.total;
    
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'مبيعات POS - ' || COALESCE(v_order.order_number, '') || ' - ' || v_currency || ' ' || v_foreign_amount::TEXT || ' @ ' || v_rate::TEXT,
      v_debit_account,
      COALESCE(v_terminal.revenue_account_code, '4100'),
      v_order.total,
      'شيكل',
      'pos_sale',
      v_order.customer_id,
      v_order.order_number,
      v_currency,
      v_idempotency
    )
    RETURNING id INTO v_tx_id;

    -- Record exchange rate difference if significant
    IF ABS(v_rate_diff) > 0.01 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type,
        reference, idempotency_key
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'فروق عملة - ' || v_currency || ' - سعر ' || v_rate::TEXT || ' - ' || COALESCE(v_order.order_number, ''),
        CASE WHEN v_rate_diff > 0 THEN v_debit_account ELSE '5600' END,
        CASE WHEN v_rate_diff > 0 THEN '4600' ELSE v_debit_account END,
        ABS(v_rate_diff),
        'شيكل',
        'exchange_diff',
        v_order.order_number,
        'FXDIFF-' || p_order_id::TEXT
      );
    END IF;
  END IF;

  -- Create COGS journal entry if there's cost
  IF v_total_cogs > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'تكلفة بضاعة مباعة - ' || COALESCE(v_order.order_number, ''),
      COALESCE(v_terminal.cogs_account_code, '5200'),
      COALESCE(v_terminal.inventory_account_code, '1200'),
      v_total_cogs,
      'شيكل',
      'pos_cogs',
      v_order.order_number,
      'COGS-' || p_order_id::TEXT
    );
  END IF;

  -- Update order state with currency info
  UPDATE public.pos_orders
  SET state = 'paid', 
      linked_transaction_id = v_tx_id, 
      payment_currency = v_currency,
      payment_currency_rate = v_rate,
      payment_currency_amount = v_foreign_amount,
      ils_equivalent = v_order.total,
      rate_source = COALESCE(p_payments->0->>'rate_source', 'system'),
      updated_at = now()
  WHERE id = p_order_id;

  -- Update session totals
  UPDATE public.pos_sessions
  SET total_sales = total_sales + v_order.total,
      total_orders = total_orders + 1,
      updated_at = now()
  WHERE id = v_order.session_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'order_number', v_order.order_number,
    'total', v_order.total,
    'cogs', v_total_cogs,
    'currency', v_currency,
    'foreign_amount', v_foreign_amount,
    'exchange_rate', v_rate
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;