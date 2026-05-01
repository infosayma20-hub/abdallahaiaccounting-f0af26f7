-- ============================================================
-- REP ORDERS HARD FIX (no fallback)
-- 1) إصلاح create_rep_sale_atomic ليستخدم schema الفعلي
-- 2) Guard trigger يرفض أي invoice source='rep' بدون linked_transaction_id
-- 3) flags جديدة: rep_disable_stock_deduction, rep_allow_negative_stock
-- 4) إزالة feature flag rep_use_rpc
-- 5) RPC backfill + RPC void للـ legacy
-- 6) تعليم legacy تلقائياً
-- ============================================================

-- (3) أعمدة الـ flags الجديدة على company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS rep_disable_stock_deduction BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rep_allow_negative_stock    BOOLEAN NOT NULL DEFAULT false;

-- ترحيل: أي tenant عنده pos_disable_stock_deduction=true → نطبق نفس السلوك على rep
UPDATE public.company_settings
   SET rep_disable_stock_deduction = true
 WHERE pos_disable_stock_deduction = true
   AND rep_disable_stock_deduction = false;

-- (4) حذف rep_use_rpc من feature_flags لكل الـ tenants
UPDATE public.company_settings
   SET feature_flags = feature_flags - 'rep_use_rpc'
 WHERE feature_flags ? 'rep_use_rpc';

-- (1) إعادة كتابة create_rep_sale_atomic بشكل صحيح
CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(
  p_user_id uuid, p_sales_rep_id uuid, p_warehouse_id uuid, p_van_day_id uuid,
  p_contact_id uuid, p_contact_name text, p_payment_method text,
  p_items jsonb, p_idempotency_key text, p_invoice_number text DEFAULT NULL::text
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
  v_inv_rpc JSONB;
  v_pm_arabic TEXT; v_existing_id UUID;
  v_qty NUMERIC; v_price NUMERIC; v_cost NUMERIC; v_line_profit NUMERIC;
  v_tx_id UUID;
  v_disable_stock BOOLEAN; v_allow_negative BOOLEAN;
  v_current_stock NUMERIC;
BEGIN
  -- اقرأ الـ flags
  SELECT COALESCE(rep_disable_stock_deduction,false), COALESCE(rep_allow_negative_stock,false)
    INTO v_disable_stock, v_allow_negative
    FROM public.company_settings WHERE user_id = p_user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);
  v_allow_negative := COALESCE(v_allow_negative, false);

  -- Idempotency
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

  -- Validation pass: cost + stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, COALESCE(buy_price,0) AS bp, COALESCE(quantity,0) AS qty, name
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_item->>'product_id'; END IF;

    v_qty := (v_item->>'qty')::numeric;
    v_price := (v_item->>'price')::numeric;
    v_total := v_total + v_qty * v_price;

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
  v_total_profit := v_total - v_total_cost;

  v_pm_arabic := CASE WHEN p_payment_method = 'cash' THEN 'نقدي' ELSE 'آجل' END;

  -- ينشئ القيد المحاسبي + قد ينشئ الفاتورة
  v_inv_rpc := public.create_invoice_with_entry(
    p_user_id => p_user_id, p_contact_id => p_contact_id, p_contact_name => p_contact_name,
    p_amount => v_total, p_description => 'Rep sale ' || COALESCE(p_invoice_number, p_idempotency_key),
    p_payment_method => v_pm_arabic, p_currency => 'شيكل', p_items => '[]'::jsonb,
    p_idempotency_key => p_idempotency_key, p_invoice_type => 'sales',
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
    -- نتجاوز الـ guard trigger بإدراج كامل البيانات
    INSERT INTO public.invoices (user_id, warehouse_id, contact_id, invoice_number, invoice_type,
                                  status, payment_method, total_amount, linked_transaction_id,
                                  salesperson_id, source)
    VALUES (p_user_id, p_warehouse_id,
            CASE WHEN p_payment_method='credit' THEN p_contact_id END,
            v_invoice_no, 'sales', 'posted', p_payment_method, v_total, v_tx_id,
            p_sales_rep_id, 'rep')
    RETURNING id INTO v_invoice_id;
  ELSE
    UPDATE public.invoices
       SET linked_transaction_id = COALESCE(linked_transaction_id, v_tx_id),
           salesperson_id        = COALESCE(salesperson_id, p_sales_rep_id),
           source                = 'rep',
           warehouse_id          = COALESCE(warehouse_id, p_warehouse_id)
     WHERE id = v_invoice_id;
  END IF;

  -- البنود + المخزون
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
        (user_id, product_id, warehouse_id, movement_type, quantity, reference_note)
      VALUES (p_user_id, (v_item->>'product_id')::uuid, p_warehouse_id, 'صادر', v_qty,
              'Rep sale ' || v_invoice_no);

      UPDATE public.products
         SET quantity = COALESCE(quantity,0) - v_qty,
             updated_at = now()
       WHERE id = (v_item->>'product_id')::uuid AND user_id = p_user_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'duplicate', false,
    'invoice_id', v_invoice_id, 'invoice_number', v_invoice_no,
    'transaction_id', v_tx_id,
    'total', v_total, 'total_cost', v_total_cost, 'total_profit', v_total_profit,
    'stock_deducted', NOT v_disable_stock
  );
END;
$function$;

-- (2) Guard trigger: منع insert/update لـ invoices source='rep' بدون linked_transaction_id
CREATE OR REPLACE FUNCTION public.guard_rep_invoice_must_be_posted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source = 'rep' AND NEW.linked_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Rep invoices must be created via create_rep_sale_atomic (linked_transaction_id required)'
      USING ERRCODE = 'check_violation', HINT = 'Use rpc create_rep_sale_atomic';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_rep_invoice ON public.invoices;
CREATE TRIGGER trg_guard_rep_invoice
BEFORE INSERT OR UPDATE OF source, linked_transaction_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.guard_rep_invoice_must_be_posted();

-- (5) Backfill RPC للـ legacy: ترحّل invoice موجودة بدون قيد
CREATE OR REPLACE FUNCTION public.rep_invoice_post_now(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv RECORD; v_item RECORD; v_tx_id UUID;
  v_total_cost NUMERIC := 0; v_pm_arabic TEXT; v_inv_rpc JSONB;
  v_disable_stock BOOLEAN;
  v_unknown_cost BOOLEAN := false;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.linked_transaction_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_posted', true);
  END IF;
  IF v_inv.source <> 'rep' THEN
    RAISE EXCEPTION 'Only rep invoices can be backfilled';
  END IF;

  SELECT COALESCE(rep_disable_stock_deduction,false) INTO v_disable_stock
    FROM public.company_settings WHERE user_id = v_inv.user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);

  v_pm_arabic := CASE WHEN v_inv.payment_method = 'cash' THEN 'نقدي' ELSE 'آجل' END;

  v_inv_rpc := public.create_invoice_with_entry(
    p_user_id => v_inv.user_id, p_contact_id => v_inv.contact_id, p_contact_name => v_inv.contact_name,
    p_amount => v_inv.total_amount, p_description => 'Rep sale BACKFILL ' || v_inv.invoice_number,
    p_payment_method => v_pm_arabic, p_currency => 'شيكل', p_items => '[]'::jsonb,
    p_idempotency_key => 'BF-' || v_inv.id::text, p_invoice_type => 'sales',
    p_transaction_date => v_inv.invoice_date, p_foreign_amount => NULL, p_exchange_rate => NULL,
    p_reference => v_inv.invoice_number,
    p_workshop_id => NULL, p_cost_center_name => NULL
  );
  IF NOT COALESCE((v_inv_rpc->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'Backfill failed: %', v_inv_rpc->>'error';
  END IF;
  v_tx_id := NULLIF(v_inv_rpc->>'transaction_id','')::uuid;

  -- ربط القيد + إصلاح cost/profit + خصم المخزون
  UPDATE public.invoices SET linked_transaction_id = v_tx_id WHERE id = p_invoice_id;

  FOR v_item IN
    SELECT ii.*, COALESCE(p.buy_price,0) AS bp, p.name AS pname
      FROM public.invoice_items ii
      LEFT JOIN public.products p ON p.id = ii.product_id
     WHERE ii.invoice_id = p_invoice_id
  LOOP
    IF v_item.bp = 0 THEN v_unknown_cost := true; END IF;
    UPDATE public.invoice_items
       SET cost_price = NULLIF(v_item.bp,0),
           line_profit = CASE WHEN v_item.bp=0 THEN NULL ELSE (v_item.unit_price - v_item.bp) * v_item.quantity END
     WHERE id = v_item.id;

    IF NOT v_disable_stock AND v_item.product_id IS NOT NULL THEN
      INSERT INTO public.stock_movements (user_id, product_id, warehouse_id, movement_type, quantity, reference_note)
      VALUES (v_inv.user_id, v_item.product_id, v_inv.warehouse_id, 'صادر', v_item.quantity,
              'Rep backfill ' || v_inv.invoice_number);
      UPDATE public.products
         SET quantity = COALESCE(quantity,0) - v_item.quantity, updated_at = now()
       WHERE id = v_item.product_id AND user_id = v_inv.user_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id, 'unknown_cost', v_unknown_cost);
END;
$$;

-- (5b) Void RPC للـ legacy
CREATE OR REPLACE FUNCTION public.rep_invoice_void_legacy(p_invoice_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_inv RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.linked_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already posted; use credit note instead';
  END IF;
  UPDATE public.invoices
     SET status = 'void',
         notes_internal = COALESCE(notes_internal,'') || E'\n[VOID-LEGACY] ' || COALESCE(p_reason,'no reason')
   WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rep_invoice_post_now(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rep_invoice_void_legacy(uuid, text) TO authenticated;