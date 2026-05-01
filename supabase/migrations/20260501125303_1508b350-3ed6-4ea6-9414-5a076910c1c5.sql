-- Normalize invoice_type to 'sale' (singular) — fixes rep invoices appearing as purchases in preview
UPDATE public.invoices SET invoice_type = 'sale' WHERE invoice_type = 'sales';

-- Patch create_rep_sale_atomic to write 'sale' instead of 'sales'
CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(
  p_user_id uuid, p_sales_rep_id uuid, p_warehouse_id uuid, p_contact_id uuid,
  p_contact_name text, p_payment_method text, p_invoice_number text,
  p_idempotency_key text, p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric := 0; v_total_cost numeric := 0; v_total_profit numeric := 0;
  v_item jsonb; v_product RECORD; v_qty numeric; v_price numeric; v_cost numeric;
  v_line_total numeric; v_line_profit numeric; v_invoice_id uuid; v_tx_id uuid;
  v_invoice_no text; v_inv_rpc jsonb; v_pm_arabic text; v_settings RECORD;
  v_disable_stock boolean := false; v_allow_negative boolean := false;
  v_current_stock numeric;
BEGIN
  SELECT rep_disable_stock_deduction, rep_allow_negative_stock
    INTO v_disable_stock, v_allow_negative
    FROM public.company_settings WHERE user_id = p_user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);
  v_allow_negative := COALESCE(v_allow_negative, false);

  -- Validate + totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, name, COALESCE(buy_price,0) AS buy_price, COALESCE(quantity,0) AS quantity
      INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product % not found', v_item->>'product_id';
    END IF;
    IF v_product.buy_price IS NULL OR v_product.buy_price <= 0 THEN
      RAISE EXCEPTION 'Product "%": missing buy_price', v_product.name;
    END IF;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_total := v_total + (v_qty * v_price);
    v_total_cost := v_total_cost + (v_qty * v_product.buy_price);

    IF NOT v_disable_stock AND NOT v_allow_negative THEN
      v_current_stock := v_product.quantity;
      IF v_current_stock < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for "%": have %, need %', v_product.name, v_current_stock, v_qty;
      END IF;
    END IF;
  END LOOP;
  v_total_profit := v_total - v_total_cost;

  v_pm_arabic := CASE WHEN p_payment_method = 'cash' THEN 'نقدي' ELSE 'آجل' END;

  v_inv_rpc := public.create_invoice_with_entry(
    p_user_id => p_user_id, p_contact_id => p_contact_id, p_contact_name => p_contact_name,
    p_amount => v_total, p_description => 'Rep sale ' || COALESCE(p_invoice_number, p_idempotency_key),
    p_payment_method => v_pm_arabic, p_currency => 'شيكل', p_items => '[]'::jsonb,
    p_idempotency_key => p_idempotency_key, p_invoice_type => 'sale',
    p_transaction_date => CURRENT_DATE, p_foreign_amount => NULL, p_exchange_rate => NULL,
    p_reference => COALESCE(p_invoice_number, p_idempotency_key),
    p_workshop_id => NULL, p_cost_center_name => NULL
  );
  IF NOT COALESCE((v_inv_rpc->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'create_invoice_with_entry failed: %', v_inv_rpc->>'error';
  END IF;

  v_tx_id := NULLIF(v_inv_rpc->>'transaction_id','')::uuid;
  v_invoice_no := COALESCE(p_invoice_number, p_idempotency_key);

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'create_invoice_with_entry did not return a transaction_id';
  END IF;

  SELECT id INTO v_invoice_id FROM public.invoices
   WHERE user_id = p_user_id AND (invoice_number = v_invoice_no OR id::text = v_inv_rpc->>'invoice_id')
   ORDER BY created_at DESC LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (user_id, warehouse_id, contact_id, invoice_number, invoice_type,
                                  status, payment_method, total_amount, linked_transaction_id,
                                  salesperson_id, source)
    VALUES (p_user_id, p_warehouse_id,
            CASE WHEN p_payment_method='credit' THEN p_contact_id END,
            v_invoice_no, 'sale', 'posted', p_payment_method, v_total, v_tx_id,
            p_sales_rep_id, 'rep')
    RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE public.invoices
       SET linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
           salesperson_id        = COALESCE(salesperson_id, p_sales_rep_id),
           source                = 'rep',
           invoice_type          = 'sale',
           warehouse_id          = COALESCE(warehouse_id, p_warehouse_id)
     WHERE id = v_invoice_id;
  END IF;

  -- Items + stock movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT COALESCE(buy_price,0) AS bp INTO v_product
      FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    v_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_cost := v_product.bp;
    v_line_total := v_qty * v_price;
    v_line_profit := v_line_total - (v_qty * v_cost);

    INSERT INTO public.invoice_items (invoice_id, product_id, quantity, unit_price, total, cost_price, line_profit)
    VALUES (v_invoice_id, (v_item->>'product_id')::uuid, v_qty, v_price, v_line_total, v_cost, v_line_profit);

    IF NOT v_disable_stock THEN
      INSERT INTO public.stock_movements (user_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, notes)
      VALUES (p_user_id, (v_item->>'product_id')::uuid, p_warehouse_id, 'صادر', v_qty, 'invoice', v_invoice_id, 'Rep sale');
      UPDATE public.products SET quantity = COALESCE(quantity,0) - v_qty WHERE id = (v_item->>'product_id')::uuid;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'transaction_id', v_tx_id,
                            'invoice_number', v_invoice_no, 'total', v_total, 'profit', v_total_profit);
END;
$$;