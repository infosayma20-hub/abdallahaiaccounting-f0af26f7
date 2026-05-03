-- Patch create_rep_sale_atomic: post sales discount journal entry (Dr 4500 / Cr 4110)
-- when invoice has a discount. This grosses-up revenue so that:
--   Revenue (4110) = subtotal (gross)
--   Sales Discount (4500) = discount amount (debit)
--   Net effect on income = subtotal - discount = total
-- Idempotent via idempotency_key suffix '-DISC'.

CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(
  p_user_id uuid, p_sales_rep_id uuid, p_warehouse_id uuid, p_van_day_id uuid,
  p_contact_id uuid, p_contact_name text, p_payment_method text,
  p_items jsonb, p_idempotency_key text, p_invoice_number text DEFAULT NULL::text,
  p_discount_type text DEFAULT NULL,
  p_discount_value numeric DEFAULT 0
)
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

  SELECT id INTO v_existing_id FROM public.invoices
   WHERE user_id = p_user_id AND invoice_number = COALESCE(p_invoice_number, p_idempotency_key) LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'invoice_id', v_existing_id);
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
                                  status, payment_method, subtotal, discount_amount, total_amount,
                                  linked_transaction_id, salesperson_id, source)
    VALUES (p_user_id, p_warehouse_id,
            CASE WHEN p_payment_method='credit' THEN p_contact_id END,
            v_invoice_no, 'sale', 'posted', p_payment_method,
            v_subtotal, v_discount_amount, v_total, v_tx_id, p_sales_rep_id, 'rep')
    RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE public.invoices
       SET linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
           salesperson_id        = COALESCE(salesperson_id, p_sales_rep_id),
           source                = 'rep',
           invoice_type          = 'sale',
           warehouse_id          = COALESCE(warehouse_id, p_warehouse_id),
           subtotal              = v_subtotal,
           discount_amount       = v_discount_amount,
           total_amount          = v_total
     WHERE id = v_invoice_id;
  END IF;

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

  -- ============================================================
  -- Sales Discount gross-up entry: Dr 4500 / Cr 4110
  -- This converts the net entry into a gross + discount presentation.
  -- ============================================================
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

  -- ============================================================
  -- COGS journal entry: Dr 5100 / Cr 1140
  -- ============================================================
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
    'cogs_transaction_id', v_cogs_tx_id,
    'discount_transaction_id', v_disc_tx_id,
    'stock_deducted', NOT v_disable_stock
  );
END;
$function$;


-- Patch void to also reverse the discount entry
CREATE OR REPLACE FUNCTION public.void_rep_sale_atomic(p_invoice_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD; v_item RECORD;
  v_reverse_tx_id uuid; v_reverse_cogs_id uuid; v_reverse_disc_id uuid;
  v_caller uuid := auth.uid();
  v_disable_stock boolean; v_movements_count int := 0;
  v_period_locked boolean := false;
  v_cogs_tx_id uuid; v_disc_tx_id uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'سبب الإلغاء مطلوب (3 حروف على الأقل)';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.source IS DISTINCT FROM 'rep' THEN
    RAISE EXCEPTION 'هذه الدالة مخصصة لفواتير المندوبين فقط';
  END IF;
  IF v_inv.status IN ('cancelled','void') THEN
    RAISE EXCEPTION 'الطلب ملغى مسبقاً';
  END IF;
  IF v_inv.linked_transaction_id IS NULL THEN
    RAISE EXCEPTION 'هذه الفاتورة غير مرحّلة (Draft) — استخدم الحذف بدلاً من الإلغاء';
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.fiscal_periods fp
       WHERE fp.user_id = v_inv.user_id
         AND v_inv.invoice_date BETWEEN fp.start_date AND fp.end_date
         AND COALESCE(fp.is_closed, false) = true
    ) INTO v_period_locked;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_period_locked := false;
  END;
  IF v_period_locked THEN
    RAISE EXCEPTION 'لا يمكن إلغاء طلب ضمن فترة مالية مقفلة';
  END IF;

  v_reverse_tx_id := public.create_reverse_entry(
    v_inv.linked_transaction_id,
    'إلغاء طلب مندوب ' || v_inv.invoice_number || ' — ' || p_reason,
    v_caller
  );

  -- Reverse COGS entry if it exists
  SELECT id INTO v_cogs_tx_id FROM public.transactions
    WHERE user_id = v_inv.user_id
      AND reference = v_inv.invoice_number
      AND debit_account_code = '5100'
      AND COALESCE(is_deleted,false) = false
    ORDER BY created_at DESC LIMIT 1;
  IF v_cogs_tx_id IS NOT NULL THEN
    v_reverse_cogs_id := public.create_reverse_entry(
      v_cogs_tx_id,
      'عكس تكلفة بضاعة مباعة - إلغاء ' || v_inv.invoice_number,
      v_caller
    );
  END IF;

  -- Reverse Sales Discount entry if it exists
  SELECT id INTO v_disc_tx_id FROM public.transactions
    WHERE user_id = v_inv.user_id
      AND reference = v_inv.invoice_number
      AND debit_account_code = '4500'
      AND COALESCE(is_deleted,false) = false
    ORDER BY created_at DESC LIMIT 1;
  IF v_disc_tx_id IS NOT NULL THEN
    v_reverse_disc_id := public.create_reverse_entry(
      v_disc_tx_id,
      'عكس خصم مبيعات - إلغاء ' || v_inv.invoice_number,
      v_caller
    );
  END IF;

  SELECT COALESCE(rep_disable_stock_deduction,false) INTO v_disable_stock
    FROM public.company_settings WHERE user_id = v_inv.user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);

  IF NOT v_disable_stock AND v_inv.warehouse_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity FROM public.invoice_items
       WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL
    LOOP
      INSERT INTO public.stock_movements (user_id, product_id, warehouse_id, movement_type, quantity, reference_note)
      VALUES (v_inv.user_id, v_item.product_id, v_inv.warehouse_id, 'وارد', v_item.quantity,
              'إلغاء فاتورة مندوب ' || v_inv.invoice_number);
      UPDATE public.products
         SET quantity = COALESCE(quantity,0) + v_item.quantity, updated_at = now()
       WHERE id = v_item.product_id AND user_id = v_inv.user_id;
      v_movements_count := v_movements_count + 1;
    END LOOP;
  END IF;

  UPDATE public.invoices
     SET status = 'cancelled',
         notes_internal = COALESCE(notes_internal,'') ||
           E'\n[CANCELLED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] reason=' || p_reason ||
           ' reverse_tx=' || v_reverse_tx_id::text ||
           CASE WHEN v_reverse_cogs_id IS NOT NULL THEN ' reverse_cogs=' || v_reverse_cogs_id::text ELSE '' END ||
           CASE WHEN v_reverse_disc_id IS NOT NULL THEN ' reverse_disc=' || v_reverse_disc_id::text ELSE '' END
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'reverse_transaction_id', v_reverse_tx_id,
    'reverse_cogs_transaction_id', v_reverse_cogs_id,
    'reverse_discount_transaction_id', v_reverse_disc_id,
    'stock_movements_reversed', v_movements_count
  );
END;
$function$;