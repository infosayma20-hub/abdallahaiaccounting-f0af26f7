-- =====================================================================
-- Phase 7 — Rep Sales Atomic Integration
-- =====================================================================

-- 1) Snapshot columns on invoice_items (additive, nullable, safe)
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC,
  ADD COLUMN IF NOT EXISTS line_profit NUMERIC;

COMMENT ON COLUMN public.invoice_items.cost_price IS
  'Snapshot of products.buy_price at time of sale (for profit calculation). Nullable for legacy rows.';
COMMENT ON COLUMN public.invoice_items.line_profit IS
  '(unit_price - cost_price) * quantity. Nullable when cost_price is unknown.';

-- 2) Unified atomic RPC for Rep Sales
CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(
  p_user_id          UUID,
  p_sales_rep_id     UUID,
  p_warehouse_id     UUID,
  p_van_day_id       UUID,
  p_contact_id       UUID,
  p_contact_name     TEXT,
  p_payment_method   TEXT,            -- 'cash' | 'credit'
  p_items            JSONB,           -- [{product_id, name, qty, price}]
  p_idempotency_key  TEXT,
  p_invoice_number   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total          NUMERIC := 0;
  v_total_cost     NUMERIC := 0;
  v_total_profit   NUMERIC := 0;
  v_item           JSONB;
  v_product        RECORD;
  v_invoice_id     UUID;
  v_invoice_no     TEXT;
  v_inv_rpc        JSONB;
  v_recv_rpc       JSONB;
  v_dec_result     JSONB;
  v_pm_arabic      TEXT;
  v_inv_type_db    TEXT;
  v_existing_id    UUID;
BEGIN
  -- ---- Idempotency check (replay-safe)
  SELECT id INTO v_existing_id
  FROM public.invoices
  WHERE user_id = p_user_id
    AND invoice_number = COALESCE(p_invoice_number, p_idempotency_key)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'invoice_id', v_existing_id
    );
  END IF;

  -- ---- Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No items provided');
  END IF;

  -- ---- Compute totals + profit (snapshot buy_price)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT id, name, COALESCE(buy_price, 0) AS bp
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found for user', v_item->>'product_id';
    END IF;

    v_total      := v_total      + ((v_item->>'qty')::numeric * (v_item->>'price')::numeric);
    v_total_cost := v_total_cost + ((v_item->>'qty')::numeric * v_product.bp);
  END LOOP;
  v_total_profit := v_total - v_total_cost;

  -- ---- Map payment method (UI uses cash/credit; ledger expects Arabic)
  v_pm_arabic := CASE WHEN p_payment_method = 'cash' THEN 'نقدي' ELSE 'آجل' END;
  v_inv_type_db := 'sales';

  -- ---- Step 1: create the invoice header + GL via canonical RPC
  v_inv_rpc := public.create_invoice_with_entry(
    p_user_id          => p_user_id,
    p_contact_id       => p_contact_id,
    p_contact_name     => p_contact_name,
    p_amount           => v_total,
    p_description      => 'Rep sale ' || COALESCE(p_invoice_number, p_idempotency_key),
    p_payment_method   => v_pm_arabic,
    p_currency         => 'شيكل',
    p_items            => '[]'::jsonb,
    p_idempotency_key  => p_idempotency_key,
    p_invoice_type     => v_inv_type_db,
    p_transaction_date => CURRENT_DATE,
    p_foreign_amount   => NULL,
    p_exchange_rate    => NULL,
    p_reference        => COALESCE(p_invoice_number, p_idempotency_key),
    p_workshop_id      => NULL,
    p_cost_center_name => NULL
  );

  IF NOT COALESCE((v_inv_rpc->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'create_invoice_with_entry failed: %', v_inv_rpc->>'error';
  END IF;

  -- ---- Look up the freshly created invoice (RPC returns transaction_id, not invoice_id)
  v_invoice_no := COALESCE(p_invoice_number, p_idempotency_key);
  SELECT id INTO v_invoice_id
    FROM public.invoices
   WHERE user_id = p_user_id
     AND (invoice_number = v_invoice_no OR id::text = v_inv_rpc->>'invoice_id')
   ORDER BY created_at DESC
   LIMIT 1;

  -- If create_invoice_with_entry didn't create an invoices row (RPC only writes the GL),
  -- we create it ourselves now (header only, items follow next).
  IF v_invoice_id IS NULL THEN
    INSERT INTO public.invoices (
      user_id, warehouse_id, contact_id, invoice_number, invoice_type,
      status, payment_method, total_amount
    ) VALUES (
      p_user_id, p_warehouse_id, CASE WHEN p_payment_method='credit' THEN p_contact_id END,
      v_invoice_no, 'sale', 'posted', p_payment_method, v_total
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- ---- Step 2: insert items with cost snapshot + line profit
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT COALESCE(buy_price, 0) AS bp INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name,
      quantity, unit_price, total_amount,
      cost_price, line_profit
    ) VALUES (
      v_invoice_id,
      (v_item->>'product_id')::uuid,
      v_item->>'name',
      (v_item->>'qty')::numeric,
      (v_item->>'price')::numeric,
      (v_item->>'qty')::numeric * (v_item->>'price')::numeric,
      v_product.bp,
      ((v_item->>'price')::numeric - v_product.bp) * (v_item->>'qty')::numeric
    );

    -- ---- Step 3: write stock movement for the rep warehouse + decrement
    INSERT INTO public.stock_movements (
      user_id, product_id, movement_type, quantity, warehouse_id, reference_note
    ) VALUES (
      p_user_id, (v_item->>'product_id')::uuid, 'sale'::movement_type,
      (v_item->>'qty')::numeric, p_warehouse_id,
      'REP-SALE ' || v_invoice_no
    );

    v_dec_result := public.decrement_stock_safe(
      p_user_id, (v_item->>'product_id')::uuid,
      (v_item->>'qty')::numeric,
      'rep_sale', v_invoice_no
    );
  END LOOP;

  -- ---- Step 4: if cash sale, create matching receipt voucher
  IF p_payment_method = 'cash' THEN
    v_recv_rpc := public.create_receipt_with_entry(
      p_user_id           => p_user_id,
      p_contact_id        => NULL,
      p_contact_name      => COALESCE(p_contact_name, 'بيع نقدي - مندوب'),
      p_amount            => v_total,
      p_payment_method    => 'نقدي',
      p_description       => 'Rep cash sale ' || v_invoice_no,
      p_currency          => 'شيكل',
      p_idempotency_key   => p_idempotency_key || '-RCV',
      p_voucher_date      => CURRENT_DATE,
      p_exchange_rate     => NULL,
      p_reference         => v_invoice_no,
      p_cash_account_code => NULL,
      p_contact_account_code => NULL,
      p_notes             => 'Auto receipt from REP cash sale',
      p_employee_id       => NULL,
      p_workshop_id       => NULL,
      p_allocations       => NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_no,
    'total', v_total,
    'total_cost', v_total_cost,
    'total_profit', v_total_profit,
    'invoice_rpc', v_inv_rpc,
    'receipt_rpc', v_recv_rpc
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'create_rep_sale_atomic failed: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_rep_sale_atomic(
  UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, JSONB, TEXT, TEXT
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_rep_sale_atomic IS
  'Phase 7: Atomic rep sale = invoice + GL entry + items (with cost snapshot) + stock movement + (cash) receipt voucher. Idempotent via invoice_number lookup.';