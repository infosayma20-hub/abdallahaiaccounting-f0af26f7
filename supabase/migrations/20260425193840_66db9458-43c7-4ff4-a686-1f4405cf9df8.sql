-- ============================================================
-- Import → Inventory Integration (Landed Cost Capitalization)
-- ============================================================

-- 1) Add warehouse_id to import_shipments
ALTER TABLE public.import_shipments
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

CREATE INDEX IF NOT EXISTS idx_import_shipments_warehouse
  ON public.import_shipments(warehouse_id);

-- Index for product matching during import (per user)
CREATE INDEX IF NOT EXISTS idx_products_user_sku
  ON public.products(user_id, sku) WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_user_barcode
  ON public.products(user_id, barcode) WHERE barcode IS NOT NULL;

-- 2) Atomic posting RPC: products + stock + journal capitalized
CREATE OR REPLACE FUNCTION public.post_import_shipment_atomic(
  p_shipment_id UUID,
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shipment RECORD;
  v_item RECORD;
  v_cost RECORD;
  v_product_id UUID;
  v_tx_date DATE;
  v_ref TEXT;
  v_total_landed NUMERIC := 0;
  v_total_goods_local NUMERIC := 0;
  v_products_created INT := 0;
  v_products_linked INT := 0;
  v_movements_created INT := 0;
  v_credit_code TEXT;
BEGIN
  -- Load shipment & ownership check
  SELECT * INTO v_shipment
  FROM public.import_shipments
  WHERE id = p_shipment_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الشحنة غير موجودة');
  END IF;

  IF v_shipment.status = 'posted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الشحنة مرحّلة مسبقاً');
  END IF;

  IF v_shipment.warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تحديد المستودع قبل الترحيل');
  END IF;

  IF v_shipment.currency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'يجب تحديد العملة قبل الترحيل');
  END IF;

  -- At least one valid item
  IF NOT EXISTS (
    SELECT 1 FROM public.import_shipment_items
    WHERE shipment_id = p_shipment_id AND quantity > 0
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يوجد بنود صالحة');
  END IF;

  v_tx_date := COALESCE(v_shipment.invoice_date, CURRENT_DATE);
  v_ref := 'IMP-' || substr(p_shipment_id::text, 1, 8);

  -- ===== Process each item: link/create product + stock movement =====
  FOR v_item IN
    SELECT * FROM public.import_shipment_items
    WHERE shipment_id = p_shipment_id AND quantity > 0
    ORDER BY line_number
  LOOP
    v_product_id := v_item.product_id;

    -- Try to match existing product by SKU (model_code)
    IF v_product_id IS NULL AND v_item.model_code IS NOT NULL AND trim(v_item.model_code) <> '' THEN
      SELECT id INTO v_product_id
      FROM public.products
      WHERE user_id = p_user_id
        AND sku = trim(v_item.model_code)
      LIMIT 1;
    END IF;

    -- Create product if still not found
    IF v_product_id IS NULL THEN
      INSERT INTO public.products (
        user_id, name, category, sku,
        buy_price, sell_price, quantity, min_quantity, unit,
        is_purchased, is_sold, source
      ) VALUES (
        p_user_id,
        COALESCE(NULLIF(trim(v_item.description_en), ''), NULLIF(trim(v_item.description_ar), ''), v_item.model_code, 'صنف مستورد'),
        'استيراد',
        NULLIF(trim(v_item.model_code), ''),
        COALESCE(v_item.landed_cost_per_unit, 0),
        COALESCE(v_item.landed_cost_per_unit, 0) * 1.3,
        0,
        0,
        'قطعة',
        true, true, 'import'
      )
      RETURNING id INTO v_product_id;
      v_products_created := v_products_created + 1;
    ELSE
      v_products_linked := v_products_linked + 1;
    END IF;

    -- Update item with product_id
    UPDATE public.import_shipment_items
    SET product_id = v_product_id
    WHERE id = v_item.id;

    -- Create stock movement (وارد)
    INSERT INTO public.stock_movements (
      user_id, product_id, warehouse_id,
      movement_type, quantity, reference_note
    ) VALUES (
      p_user_id, v_product_id, v_shipment.warehouse_id,
      'وارد'::stock_movement_type,
      v_item.quantity,
      v_ref || ' - ' || COALESCE(v_item.description_en, v_item.model_code, '')
    );
    v_movements_created := v_movements_created + 1;

    -- Update product quantity & latest buy_price (landed)
    UPDATE public.products
    SET quantity = quantity + v_item.quantity,
        buy_price = COALESCE(v_item.landed_cost_per_unit, buy_price),
        updated_at = now()
    WHERE id = v_product_id;

    v_total_landed := v_total_landed + COALESCE(v_item.landed_cost_total, 0);
    v_total_goods_local := v_total_goods_local + COALESCE(v_item.total_price_local, 0);
  END LOOP;

  -- ===== Journal entries (CAPITALIZED into Inventory 1140) =====
  -- Goods value: Dr 1140 Inventory  /  Cr 2110 Supplier
  IF v_total_goods_local > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      contact_id, reference, idempotency_key
    ) VALUES (
      p_user_id, v_tx_date,
      'استيراد بضاعة - ' || COALESCE(v_shipment.shipment_name, v_shipment.shipment_number),
      '1140', '2110',
      v_total_goods_local, 'ILS', 'import_goods',
      v_shipment.supplier_id, v_ref,
      'IMP-GOODS-' || p_shipment_id::text
    );
  END IF;

  -- Each cost: Dr 1140 Inventory (capitalized) / Cr by payment method
  FOR v_cost IN
    SELECT * FROM public.import_costs
    WHERE shipment_id = p_shipment_id AND COALESCE(amount_local, 0) > 0
  LOOP
    -- Bank fees / interest go to bank; everything else assumes payable to supplier (default 2110)
    -- Caller can later refine via dedicated supplier_id on each cost.
    v_credit_code := CASE
      WHEN v_cost.cost_type IN ('bank_fees', 'interest') THEN '1120'
      ELSE '2110'
    END;

    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      contact_id, reference, idempotency_key
    ) VALUES (
      p_user_id, v_tx_date,
      COALESCE(v_cost.cost_name_ar, v_cost.cost_type) || ' (مرسملة) - ' || COALESCE(v_shipment.shipment_name, v_shipment.shipment_number),
      '1140', v_credit_code,
      v_cost.amount_local, 'ILS', 'import_cost_capitalized',
      v_cost.supplier_id, v_ref,
      'IMP-COST-' || v_cost.id::text
    );
  END LOOP;

  -- Mark shipment as posted
  UPDATE public.import_shipments
  SET status = 'posted',
      posted_at = now(),
      total_landed_cost = v_total_landed
  WHERE id = p_shipment_id;

  RETURN jsonb_build_object(
    'success', true,
    'shipment_id', p_shipment_id,
    'products_created', v_products_created,
    'products_linked', v_products_linked,
    'movements_created', v_movements_created,
    'total_landed', v_total_landed,
    'total_goods', v_total_goods_local
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'detail', 'rollback'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_import_shipment_atomic(UUID, UUID) TO authenticated;