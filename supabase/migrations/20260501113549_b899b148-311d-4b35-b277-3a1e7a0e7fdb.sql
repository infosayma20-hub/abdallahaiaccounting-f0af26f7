-- Phase 7.1 cleanup: remove dead code in create_rep_sale_atomic
-- Reason: create_invoice_with_entry with payment_method='نقدي' already posts
-- Cash Dr / Sales Cr. The extra create_receipt_with_entry call below was a leftover
-- from an earlier draft and could cause double-posting if ever re-enabled.
-- No financial logic changes. UI untouched. Result identical for current callers.

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

  -- Cash sale: posts Cash Dr / Sales Cr inside this RPC.
  -- Credit sale: posts AR Dr / Sales Cr inside this RPC.
  -- In BOTH cases the ledger is fully recorded here; do NOT issue a separate
  -- receipt voucher for cash (would cause double-posting of the cash leg).
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

  v_invoice_no := COALESCE(p_invoice_number, p_idempotency_key);
  SELECT id INTO v_invoice_id FROM public.invoices
   WHERE user_id = p_user_id AND (invoice_number = v_invoice_no OR id::text = v_inv_rpc->>'invoice_id')
   ORDER BY created_at DESC LIMIT 1;

  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (user_id, warehouse_id, contact_id, invoice_number, invoice_type, status, payment_method, total_amount)
    VALUES (p_user_id, p_warehouse_id, CASE WHEN p_payment_method='credit' THEN p_contact_id END,
            v_invoice_no, 'sale', 'posted', p_payment_method, v_total)
    RETURNING id INTO v_invoice_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT COALESCE(buy_price, 0) AS bp INTO v_product
      FROM public.products WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    v_qty := (v_item->>'qty')::numeric; v_price := (v_item->>'price')::numeric;
    v_cost := CASE WHEN v_product.bp IS NULL OR v_product.bp = 0 THEN NULL ELSE v_product.bp END;
    v_line_profit := CASE WHEN v_cost IS NULL THEN NULL ELSE (v_price - v_cost) * v_qty END;

    INSERT INTO public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_amount, cost_price, line_profit)
    VALUES (v_invoice_id, (v_item->>'product_id')::uuid, v_item->>'name', v_qty, v_price, v_qty*v_price, v_cost, v_line_profit);

    INSERT INTO public.stock_movements (user_id, product_id, movement_type, quantity, warehouse_id, reference_note)
    VALUES (p_user_id, (v_item->>'product_id')::uuid, 'صادر'::public.stock_movement_type, v_qty, p_warehouse_id, 'REP-SALE ' || v_invoice_no);

    v_dec_result := public.decrement_stock_safe(p_user_id, (v_item->>'product_id')::uuid, v_qty, 'rep_sale', v_invoice_no);
  END LOOP;

  -- NOTE (Phase 7.1): Removed dead create_receipt_with_entry block for cash sales.
  -- create_invoice_with_entry already posts the cash leg above. Adding a receipt
  -- voucher here caused (or risked) double-posting of cash. DO NOT re-add.

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_number', v_invoice_no,
    'total', v_total, 'total_cost', v_total_cost, 'total_profit', v_total_profit,
    'has_unknown_cost', v_has_unknown_cost, 'invoice_rpc', v_inv_rpc, 'receipt_rpc', NULL);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'create_rep_sale_atomic failed: %', SQLERRM; END;
$function$;