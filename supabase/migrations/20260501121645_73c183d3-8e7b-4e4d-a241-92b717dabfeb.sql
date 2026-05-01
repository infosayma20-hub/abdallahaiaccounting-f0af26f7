-- Phase 7.3: ربط صريح بين الفاتورة والمندوب البائع
-- لا تغيير في accounting/stock — فقط حقول classification

CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(
  p_user_id uuid, p_sales_rep_id uuid, p_warehouse_id uuid, p_van_day_id uuid,
  p_contact_id uuid, p_contact_name text, p_payment_method text, p_items jsonb,
  p_idempotency_key text, p_invoice_number text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC := 0; v_total_cost NUMERIC := 0; v_total_profit NUMERIC := 0;
  v_has_unknown_cost BOOLEAN := false;
  v_item JSONB; v_product RECORD; v_invoice_id UUID; v_invoice_no TEXT;
  v_inv_rpc JSONB; v_dec_result JSONB;
  v_pm_arabic TEXT; v_inv_type_db TEXT; v_existing_id UUID;
  v_qty NUMERIC; v_price NUMERIC; v_cost NUMERIC; v_line_profit NUMERIC;
  v_tx_id UUID;
BEGIN
  SELECT id INTO v_existing_id FROM public.invoices
  WHERE user_id = p_user_id AND invoice_number = COALESCE(p_invoice_number, p_idempotency_key) LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'invoice_id', v_existing_id);
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items provided');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, COALESCE(buy_price, 0) AS bp INTO v_product
      FROM public.products WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_item->>'product_id'; END IF;
    v_qty := (v_item->>'qty')::numeric; v_price := (v_item->>'price')::numeric;
    v_total := v_total + v_qty * v_price;
    IF v_product.bp IS NULL OR v_product.bp = 0 THEN v_has_unknown_cost := true;
    ELSE v_total_cost := v_total_cost + v_qty * v_product.bp; END IF;
  END LOOP;
  v_total_profit := CASE WHEN v_has_unknown_cost THEN NULL ELSE v_total - v_total_cost END;

  v_pm_arabic := CASE WHEN p_payment_method = 'cash' THEN 'نقدي' ELSE 'آجل' END;
  v_inv_type_db := 'sales';

  v_inv_rpc := public.create_invoice_with_entry(
    p_user_id => p_user_id, p_contact_id => p_contact_id, p_contact_name => p_contact_name,
    p_amount => v_total, p_description => 'Rep sale ' || COALESCE(p_invoice_number, p_idempotency_key),
    p_payment_method => v_pm_arabic, p_currency => 'شيكل', p_items => '[]'::jsonb,
    p_idempotency_key => p_idempotency_key, p_invoice_type => v_inv_type_db,
    p_transaction_date => CURRENT_DATE, p_foreign_amount => NULL, p_exchange_rate => NULL,
    p_reference => COALESCE(p_invoice_number, p_idempotency_key),
    p_workshop_id => NULL, p_cost_center_name => NULL
  );
  IF NOT COALESCE((v_inv_rpc->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'create_invoice_with_entry failed: %', v_inv_rpc->>'error';
  END IF;

  v_tx_id := NULLIF(v_inv_rpc->>'transaction_id','')::uuid;
  v_invoice_no := COALESCE(p_invoice_number, p_idempotency_key);

  SELECT id INTO v_invoice_id FROM public.invoices
   WHERE user_id = p_user_id AND (invoice_number = v_invoice_no OR id::text = v_inv_rpc->>'invoice_id')
   ORDER BY created_at DESC LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (user_id, warehouse_id, contact_id, invoice_number, invoice_type, status, payment_method, total_amount, linked_transaction_id, salesperson_id, source)
    VALUES (p_user_id, p_warehouse_id, CASE WHEN p_payment_method='credit' THEN p_contact_id END,
            v_invoice_no, 'sale', 'posted', p_payment_method, v_total, v_tx_id, p_sales_rep_id, 'rep')
    RETURNING id INTO v_invoice_id;
  ELSE
    -- Phase 7.2 + 7.3: ensure linked transaction + salesperson + source are set
    UPDATE public.invoices
       SET linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
           salesperson_id = COALESCE(salesperson_id, p_sales_rep_id),
           source = COALESCE(NULLIF(source, 'manual'), 'rep'),
           warehouse_id = COALESCE(warehouse_id, p_warehouse_id)
     WHERE id = v_invoice_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT COALESCE(buy_price, 0) AS bp INTO v_product
      FROM public.products WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    v_qty := (v_item->>'qty')::numeric; v_price := (v_item->>'price')::numeric;
    v_cost := CASE WHEN v_product.bp IS NULL OR v_product.bp = 0 THEN NULL ELSE v_product.bp END;
    v_line_profit := CASE WHEN v_cost IS NULL THEN NULL ELSE (v_price - v_cost) * v_qty END;

    INSERT INTO public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_amount, cost_price, line_profit)
    VALUES (v_invoice_id, (v_item->>'product_id')::uuid, v_item->>'name', v_qty, v_price, v_qty * v_price, v_cost, v_line_profit);

    INSERT INTO public.stock_movements (user_id, product_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes)
    VALUES (p_user_id, (v_item->>'product_id')::uuid, p_warehouse_id, 'sale', -v_qty, v_cost, 'invoice', v_invoice_id, 'Rep sale');

    v_dec_result := public.decrement_stock_safe(
      p_user_id => p_user_id, p_product_id => (v_item->>'product_id')::uuid,
      p_warehouse_id => p_warehouse_id, p_qty => v_qty
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_no,
    'total', v_total, 'total_cost', v_total_cost, 'total_profit', v_total_profit
  );
END;
$function$;

-- Backfill: ربط الفواتير القديمة REP-% بالمندوب الصحيح بناءً على المخزن الافتراضي
UPDATE public.invoices i
   SET salesperson_id = sr.id,
       source = CASE WHEN i.source = 'manual' OR i.source IS NULL THEN 'rep' ELSE i.source END
  FROM public.sales_representatives sr
 WHERE i.invoice_number LIKE 'REP-%'
   AND i.salesperson_id IS NULL
   AND sr.user_id = i.user_id
   AND sr.default_warehouse_id = i.warehouse_id
   AND sr.is_active = true;