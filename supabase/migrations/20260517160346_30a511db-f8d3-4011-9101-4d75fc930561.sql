CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(p_user_id uuid, p_sales_rep_id uuid, p_warehouse_id uuid, p_van_day_id uuid, p_contact_id uuid, p_contact_name text, p_payment_method text, p_items jsonb, p_idempotency_key text, p_invoice_number text DEFAULT NULL::text, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal NUMERIC := 0; v_total NUMERIC := 0;
  v_discount_amount NUMERIC := 0;
  v_total_cost NUMERIC := 0; v_total_profit NUMERIC := 0;
  v_item JSONB; v_product RECORD; v_invoice_id UUID; v_invoice_no TEXT;
  v_inv_rpc JSONB;
  v_pm_arabic TEXT; v_existing_id UUID;
  v_qty NUMERIC; v_price NUMERIC; v_cost NUMERIC; v_line_profit NUMERIC;
  v_tx_id UUID;
  v_disable_stock BOOLEAN; v_allow_negative BOOLEAN;
  v_current_stock NUMERIC;
  v_cogs_tx_id UUID; v_cogs_key TEXT;
  v_disc_tx_id UUID; v_disc_key TEXT;
BEGIN
  SELECT COALESCE(rep_disable_stock_deduction,false), COALESCE(rep_allow_negative_stock,false)
    INTO v_disable_stock, v_allow_negative
    FROM public.company_settings WHERE user_id = p_user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);
  v_allow_negative := COALESCE(v_allow_negative, false);

  SELECT i.id, i.invoice_number INTO v_existing_id, v_invoice_no
  FROM public.invoices i
  JOIN public.transactions t ON t.id = i.linked_transaction_id
  WHERE i.user_id = p_user_id AND t.idempotency_key = p_idempotency_key
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'invoice_id', v_existing_id, 'invoice_number', v_invoice_no);
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No items provided';
  END IF;
  IF p_warehouse_id IS NULL AND NOT v_disable_stock THEN
    RAISE EXCEPTION 'warehouse_id is required when stock deduction is enabled';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, COALESCE(buy_price,0) AS bp, COALESCE(quantity,0) AS qty, name
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_item->>'product_id'; END IF;

    v_qty := (v_item->>'qty')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_subtotal := v_subtotal + v_qty * v_price;

    IF v_product.bp IS NULL OR v_product.bp = 0 THEN
      RAISE EXCEPTION 'Product "%" has no buy_price; cannot compute profit', v_product.name;
    ELSE
      v_total_cost := v_total_cost + v_qty * v_product.bp;
    END IF;

    IF NOT v_disable_stock AND NOT v_allow_negative THEN
      v_current_stock := COALESCE(v_product.qty, 0);
      IF v_current_stock < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for "%": have %, need %', v_product.name, v_current_stock, v_qty;
      END IF;
    END IF;
  END LOOP;

  IF p_discount_value IS NOT NULL AND p_discount_value > 0 AND p_discount_type IN ('percent','value') THEN
    IF p_discount_type = 'percent' THEN
      IF p_discount_value > 100 THEN
        RAISE EXCEPTION 'Discount percent cannot exceed 100';
      END IF;
      v_discount_amount := ROUND(v_subtotal * (p_discount_value / 100.0), 2);
    ELSE
      v_discount_amount := p_discount_value;
    END IF;
    IF v_discount_amount > v_subtotal THEN
      RAISE EXCEPTION 'Discount (%) cannot exceed subtotal (%)', v_discount_amount, v_subtotal;
    END IF;
  END IF;

  v_total := v_subtotal - v_discount_amount;
  v_total_profit := v_total - v_total_cost;
  v_pm_arabic := CASE WHEN p_payment_method = 'cash' THEN 'نقدي' ELSE 'آجل' END;

  v_inv_rpc := public.create_invoice_with_entry(
    p_user_id => p_user_id, p_contact_id => p_contact_id, p_contact_name => p_contact_name,
    p_amount => v_total, p_description => 'Rep sale ' || p_idempotency_key,
    p_payment_method => v_pm_arabic, p_currency => 'شيكل', p_items => '[]'::jsonb,
    p_idempotency_key => p_idempotency_key, p_invoice_type => 'sale',
    p_transaction_date => CURRENT_DATE, p_foreign_amount => NULL, p_exchange_rate => NULL,
    p_reference => p_idempotency_key,
    p_workshop_id => NULL, p_cost_center_name => NULL
  );
  IF NOT COALESCE((v_inv_rpc->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'create_invoice_with_entry failed: %', v_inv_rpc->>'error';
  END IF;

  v_tx_id := NULLIF(v_inv_rpc->>'transaction_id','')::uuid;
  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'create_invoice_with_entry did not return a transaction_id';
  END IF;

  INSERT INTO public.invoices (user_id, warehouse_id, contact_id, invoice_type,
                                status, payment_method, subtotal, discount_amount, total_amount,
                                linked_transaction_id, salesperson_id, source)
  VALUES (p_user_id, p_warehouse_id,
          CASE WHEN p_payment_method='credit' THEN p_contact_id END,
          'sale', 'posted', p_payment_method,
          v_subtotal, v_discount_amount, v_total, v_tx_id, p_sales_rep_id, 'rep')
  RETURNING id, invoice_number INTO v_invoice_id, v_invoice_no;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT COALESCE(buy_price,0) AS bp INTO v_product
      FROM public.products WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    v_qty := (v_item->>'qty')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_cost := v_product.bp;
    v_line_profit := (v_price - v_cost) * v_qty;

    INSERT INTO public.invoice_items
      (invoice_id, product_id, product_name, quantity, unit_price, total_amount, cost_price, line_profit)
    VALUES (v_invoice_id, (v_item->>'product_id')::uuid, v_item->>'name',
            v_qty, v_price, v_qty * v_price, v_cost, v_line_profit);

    IF NOT v_disable_stock THEN
      INSERT INTO public.stock_movements
        (user_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, reference_note)
      VALUES (p_user_id, (v_item->>'product_id')::uuid, p_warehouse_id, 'صادر', v_qty,
              'invoice', v_invoice_id, 'Rep sale ' || v_invoice_no);

      UPDATE public.products
         SET quantity = COALESCE(quantity,0) - v_qty,
             updated_at = now()
       WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    END IF;
  END LOOP;

  IF v_discount_amount > 0 THEN
    v_disc_key := COALESCE(p_idempotency_key, v_invoice_no) || '-DISC';
    SELECT id INTO v_disc_tx_id FROM public.transactions
      WHERE idempotency_key = v_disc_key AND user_id = p_user_id LIMIT 1;
    IF v_disc_tx_id IS NULL THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, reference,
        payment_method, idempotency_key, contact_id
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'خصم مبيعات مسموح به - ' || v_invoice_no,
        '4500', '4110',
        v_discount_amount, 'شيكل', 'sales_discount', v_invoice_no,
        v_pm_arabic, v_disc_key,
        CASE WHEN p_payment_method='credit' THEN p_contact_id END
      ) RETURNING id INTO v_disc_tx_id;
    END IF;
  END IF;

  IF v_total_cost > 0 THEN
    v_cogs_key := COALESCE(p_idempotency_key, v_invoice_no) || '-COGS';
    SELECT id INTO v_cogs_tx_id FROM public.transactions
      WHERE idempotency_key = v_cogs_key AND user_id = p_user_id LIMIT 1;
    IF v_cogs_tx_id IS NULL THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, reference,
        payment_method, idempotency_key, contact_id
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'تكلفة بضاعة مباعة - ' || v_invoice_no,
        '5100', '1140',
        v_total_cost, 'شيكل', 'cogs', v_invoice_no,
        v_pm_arabic, v_cogs_key,
        CASE WHEN p_payment_method='credit' THEN p_contact_id END
      ) RETURNING id INTO v_cogs_tx_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_no,
    'transaction_id', v_tx_id,
    'subtotal', v_subtotal, 'discount_amount', v_discount_amount,
    'total', v_total, 'total_cost', v_total_cost, 'total_profit', v_total_profit,
    'stock_deducted', NOT v_disable_stock,
    'discount_transaction_id', v_disc_tx_id,
    'cogs_transaction_id', v_cogs_tx_id
  );
END;
$function$;