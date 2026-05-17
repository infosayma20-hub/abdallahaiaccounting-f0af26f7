ALTER TABLE public.invoice_sequences
ADD COLUMN IF NOT EXISTS prefix TEXT NOT NULL DEFAULT '';

UPDATE public.invoice_sequences s
SET prefix = CASE
  WHEN s.invoice_type IN ('sale', 'sales') THEN COALESCE(NULLIF(trim(cs.invoice_prefix), ''), 'INV')
  WHEN s.invoice_type = 'purchase' THEN COALESCE(NULLIF(trim(cs.purchase_order_prefix), ''), 'PO')
  WHEN s.invoice_type = 'credit_note' THEN 'CN'
  WHEN s.invoice_type = 'debit_note' THEN 'DN'
  WHEN s.invoice_type = 'sales_return' THEN 'SR'
  WHEN s.invoice_type = 'purchase_return' THEN 'PR'
  ELSE 'DOC'
END
FROM public.company_settings cs
WHERE cs.user_id = s.user_id
  AND COALESCE(s.prefix, '') = '';

UPDATE public.invoice_sequences s
SET prefix = CASE
  WHEN s.invoice_type IN ('sale', 'sales') THEN 'INV'
  WHEN s.invoice_type = 'purchase' THEN 'PO'
  WHEN s.invoice_type = 'credit_note' THEN 'CN'
  WHEN s.invoice_type = 'debit_note' THEN 'DN'
  WHEN s.invoice_type = 'sales_return' THEN 'SR'
  WHEN s.invoice_type = 'purchase_return' THEN 'PR'
  ELSE 'DOC'
END
WHERE COALESCE(s.prefix, '') = '';

ALTER TABLE public.invoice_sequences
DROP CONSTRAINT IF EXISTS invoice_sequences_pkey;

ALTER TABLE public.invoice_sequences
ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (user_id, invoice_type, year, prefix);

WITH parsed AS (
  SELECT
    i.user_id,
    i.invoice_type,
    parts[1] AS prefix,
    parts[2]::integer AS year,
    MAX(parts[3]::integer) AS max_number
  FROM public.invoices i
  CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
  WHERE i.invoice_number IS NOT NULL
    AND i.invoice_number <> ''
    AND parts IS NOT NULL
  GROUP BY i.user_id, i.invoice_type, parts[1], parts[2]::integer
)
INSERT INTO public.invoice_sequences (user_id, invoice_type, year, prefix, last_number, updated_at)
SELECT user_id, invoice_type, year, prefix, max_number, now()
FROM parsed
WHERE year IS NOT NULL
  AND prefix IS NOT NULL
  AND max_number IS NOT NULL
ON CONFLICT (user_id, invoice_type, year, prefix)
DO UPDATE SET
  last_number = GREATEST(public.invoice_sequences.last_number, EXCLUDED.last_number),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_year INTEGER;
  v_offset INTEGER := 0;
  v_max_existing INTEGER := 0;
  v_base INTEGER := 0;
  v_candidate TEXT;
BEGIN
  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'sales' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    WHEN 'credit_note' THEN 'CN'
    WHEN 'debit_note' THEN 'DN'
    WHEN 'sales_return' THEN 'SR'
    WHEN 'purchase_return' THEN 'PR'
    ELSE 'DOC'
  END;

  IF NEW.invoice_type IN ('sale', 'sales', 'purchase') THEN
    SELECT
      CASE
        WHEN NEW.invoice_type IN ('sale', 'sales') THEN COALESCE(NULLIF(trim(invoice_prefix), ''), v_prefix)
        WHEN NEW.invoice_type = 'purchase' THEN COALESCE(NULLIF(trim(purchase_order_prefix), ''), v_prefix)
        ELSE v_prefix
      END
    INTO v_prefix
    FROM public.company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;
    v_prefix := COALESCE(NULLIF(trim(v_prefix), ''), CASE WHEN NEW.invoice_type = 'purchase' THEN 'PO' ELSE 'INV' END);
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.invoice_date, NEW.created_at::date, CURRENT_DATE))::INT;

  IF NEW.invoice_type IN ('sale', 'sales') THEN
    SELECT COALESCE(invoice_number_offset, 0)
    INTO v_offset
    FROM public.companies
    WHERE owner_id = NEW.user_id
    LIMIT 1;
    v_offset := COALESCE(v_offset, 0);
  END IF;

  SELECT COALESCE(MAX(parts[3]::integer), 0)
  INTO v_max_existing
  FROM public.invoices i
  CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
  WHERE i.user_id = NEW.user_id
    AND i.invoice_type = NEW.invoice_type
    AND i.invoice_number IS NOT NULL
    AND i.invoice_number <> ''
    AND parts IS NOT NULL
    AND parts[1] = v_prefix
    AND parts[2] = v_year::text;

  v_base := GREATEST(COALESCE(v_offset, 0), COALESCE(v_max_existing, 0));

  INSERT INTO public.invoice_sequences (user_id, invoice_type, year, prefix, last_number, updated_at)
  VALUES (NEW.user_id, NEW.invoice_type, v_year, v_prefix, v_base, now())
  ON CONFLICT (user_id, invoice_type, year, prefix)
  DO UPDATE SET
    last_number = GREATEST(public.invoice_sequences.last_number, EXCLUDED.last_number),
    updated_at = now()
  RETURNING last_number INTO v_base;

  LOOP
    v_next := v_base + 1;
    v_candidate := v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.invoices
      WHERE user_id = NEW.user_id
        AND invoice_type = NEW.invoice_type
        AND invoice_number = v_candidate
    );

    v_base := v_next;
  END LOOP;

  UPDATE public.invoice_sequences
  SET last_number = v_next,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND invoice_type = NEW.invoice_type
    AND year = v_year
    AND prefix = v_prefix;

  NEW.invoice_number := v_candidate;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_rep_sale_atomic(p_user_id uuid, p_sales_rep_id uuid, p_warehouse_id uuid, p_van_day_id uuid, p_contact_id uuid, p_contact_name text, p_payment_method text, p_items jsonb, p_idempotency_key text, p_invoice_number text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total NUMERIC := 0; v_total_cost NUMERIC := 0; v_total_profit NUMERIC := 0;
  v_item JSONB; v_product RECORD; v_invoice_id UUID; v_invoice_no TEXT;
  v_inv_rpc JSONB;
  v_pm_arabic TEXT; v_existing_id UUID;
  v_qty NUMERIC; v_price NUMERIC; v_cost NUMERIC; v_line_profit NUMERIC;
  v_tx_id UUID;
  v_disable_stock BOOLEAN; v_allow_negative BOOLEAN;
  v_current_stock NUMERIC;
BEGIN
  SELECT COALESCE(rep_disable_stock_deduction,false), COALESCE(rep_allow_negative_stock,false)
    INTO v_disable_stock, v_allow_negative
    FROM public.company_settings WHERE user_id = p_user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);
  v_allow_negative := COALESCE(v_allow_negative, false);

  SELECT i.id, i.invoice_number INTO v_existing_id, v_invoice_no
  FROM public.invoices i
  JOIN public.transactions t ON t.id = i.linked_transaction_id
  WHERE i.user_id = p_user_id
    AND t.idempotency_key = p_idempotency_key
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
                                status, payment_method, total_amount, linked_transaction_id,
                                salesperson_id, source)
  VALUES (p_user_id, p_warehouse_id,
          CASE WHEN p_payment_method='credit' THEN p_contact_id END,
          'sale', 'posted', p_payment_method, v_total, v_tx_id,
          p_sales_rep_id, 'rep')
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