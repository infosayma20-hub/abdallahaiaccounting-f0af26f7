-- ============================================================
-- STEP 2: ATOMICITY + CONCURRENCY HARDENING
-- ============================================================

-- ===== PART 1: Unified document sequence table =====
CREATE TABLE IF NOT EXISTS public.document_sequences (
  user_id UUID NOT NULL,
  doc_type TEXT NOT NULL,         -- 'voucher_receipt', 'voucher_payment', 'voucher_journal', 'stock_transfer', 'delivery_note', 'warranty_card', 'warranty_claim', 'project_contract', 'van_day'
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, doc_type, year)
);

ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own document sequences" ON public.document_sequences;
CREATE POLICY "Users read own document sequences"
  ON public.document_sequences FOR SELECT
  USING (auth.uid() = user_id);

-- ===== PART 2: Helper to atomically get next number =====
CREATE OR REPLACE FUNCTION public.next_doc_number(p_user_id UUID, p_doc_type TEXT, p_year INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (p_user_id, p_doc_type, p_year, 1)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET
    last_number = document_sequences.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;

-- ===== PART 3: Backfill from existing data =====
-- vouchers
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id,
       'voucher_' || COALESCE(type, 'receipt'),
       EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN ref_number ~ '-(\d+)$'
                         THEN (regexp_match(ref_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.vouchers
WHERE ref_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, type, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- stock_transfers
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id, 'stock_transfer', EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN transfer_number ~ '-(\d+)$'
                         THEN (regexp_match(transfer_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.stock_transfers
WHERE transfer_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- delivery_notes
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id, 'delivery_note', EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN delivery_number ~ '-(\d+)$'
                         THEN (regexp_match(delivery_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.delivery_notes
WHERE delivery_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- warranty_cards (only if table exists)
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id, 'warranty_card', EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN card_number ~ '-(\d+)$'
                         THEN (regexp_match(card_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.warranty_cards
WHERE card_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- warranty_claims
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id, 'warranty_claim', EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN claim_number ~ '-(\d+)$'
                         THEN (regexp_match(claim_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.warranty_claims
WHERE claim_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- project_contracts
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id, 'project_contract', EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN contract_number ~ '-(\d+)$'
                         THEN (regexp_match(contract_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.project_contracts
WHERE contract_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- van_sales_days
INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
SELECT user_id, 'van_day', EXTRACT(YEAR FROM created_at)::INT,
       COALESCE(MAX(CASE WHEN day_number ~ '-(\d+)$'
                         THEN (regexp_match(day_number, '-(\d+)$'))[1]::INT
                         ELSE 0 END), 0)
FROM public.van_sales_days
WHERE day_number IS NOT NULL AND user_id IS NOT NULL
GROUP BY user_id, EXTRACT(YEAR FROM created_at)
ON CONFLICT (user_id, doc_type, year)
DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number);

-- ===== PART 4: Replace 7 old numbering functions =====

CREATE OR REPLACE FUNCTION public.generate_voucher_ref_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_prefix TEXT; v_next INT; v_year INT;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number != '' THEN RETURN NEW; END IF;
  v_prefix := CASE NEW.type WHEN 'receipt' THEN 'REC' WHEN 'payment' THEN 'PAY' WHEN 'journal' THEN 'JV' ELSE 'VCH' END;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  v_next := public.next_doc_number(NEW.user_id, 'voucher_' || NEW.type, v_year);
  NEW.ref_number := v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_stock_transfer_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_next INT; v_year INT;
BEGIN
  IF NEW.transfer_number IS NOT NULL AND NEW.transfer_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  v_next := public.next_doc_number(NEW.user_id, 'stock_transfer', v_year);
  NEW.transfer_number := 'TR-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_delivery_note_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_next INT; v_year INT;
BEGIN
  IF NEW.delivery_number IS NOT NULL AND NEW.delivery_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  v_next := public.next_doc_number(NEW.user_id, 'delivery_note', v_year);
  NEW.delivery_number := 'DN-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_warranty_card_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_next INT; v_year INT;
BEGIN
  IF NEW.card_number IS NOT NULL AND NEW.card_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  v_next := public.next_doc_number(NEW.user_id, 'warranty_card', v_year);
  NEW.card_number := 'WC-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_warranty_claim_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_next INT; v_year INT;
BEGIN
  IF NEW.claim_number IS NOT NULL AND NEW.claim_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  v_next := public.next_doc_number(NEW.user_id, 'warranty_claim', v_year);
  NEW.claim_number := 'WCL-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.gen_contract_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_next INT; v_year INT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::INT;
  v_next := public.next_doc_number(NEW.user_id, 'project_contract', v_year);
  NEW.contract_number := 'CON-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 3, '0');
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.gen_van_day_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_next INT; v_year INT;
BEGIN
  IF NEW.day_number IS NULL OR NEW.day_number = '' THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
    v_next := public.next_doc_number(NEW.user_id, 'van_day', v_year);
    NEW.day_number := 'VD-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END; $$;

-- ===== PART 5: Stock alerts table for negative-stock warnings =====
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL,
  product_name TEXT,
  alert_type TEXT NOT NULL DEFAULT 'negative_stock',
  quantity_before NUMERIC,
  quantity_requested NUMERIC,
  quantity_after NUMERIC,
  source TEXT,                     -- 'pos', 'invoice', 'delivery_note', 'manual'
  source_reference TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_user_unresolved
  ON public.stock_alerts (user_id, is_resolved, created_at DESC);

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own stock alerts" ON public.stock_alerts;
CREATE POLICY "Users manage own stock alerts"
  ON public.stock_alerts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ===== PART 6: Atomic stock decrement with row lock + alert =====
CREATE OR REPLACE FUNCTION public.decrement_stock_safe(
  p_user_id UUID,
  p_product_id UUID,
  p_qty NUMERIC,
  p_source TEXT,
  p_reference TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current NUMERIC;
  v_new NUMERIC;
  v_name TEXT;
  v_disable_stock BOOLEAN := false;
BEGIN
  -- Honor company setting
  SELECT COALESCE(pos_disable_stock_deduction, false)
  INTO v_disable_stock
  FROM public.company_settings WHERE user_id = p_user_id;

  IF v_disable_stock THEN
    RETURN jsonb_build_object('success', true, 'skipped', true);
  END IF;

  -- Atomic lock + read
  SELECT quantity, name INTO v_current, v_name
  FROM public.products
  WHERE id = p_product_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'المنتج غير موجود');
  END IF;

  v_new := COALESCE(v_current, 0) - p_qty;

  UPDATE public.products
  SET quantity = v_new, updated_at = now()
  WHERE id = p_product_id;

  -- Log alert if went negative
  IF v_new < 0 AND COALESCE(v_current, 0) >= 0 THEN
    INSERT INTO public.stock_alerts (
      user_id, product_id, product_name, alert_type,
      quantity_before, quantity_requested, quantity_after,
      source, source_reference
    ) VALUES (
      p_user_id, p_product_id, v_name, 'negative_stock',
      v_current, p_qty, v_new, p_source, p_reference
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'before', v_current,
    'after', v_new,
    'went_negative', v_new < 0
  );
END;
$$;

-- ===== PART 7: Atomic sale invoice creation =====
CREATE OR REPLACE FUNCTION public.create_sale_invoice_atomic(
  p_user_id UUID,
  p_contact_id UUID,
  p_contact_name TEXT,
  p_invoice_date DATE,
  p_payment_method TEXT,
  p_currency TEXT,
  p_exchange_rate NUMERIC,
  p_subtotal NUMERIC,
  p_discount_amount NUMERIC,
  p_tax_amount NUMERIC,
  p_total_amount NUMERIC,
  p_paid_amount NUMERIC,
  p_notes TEXT,
  p_items JSONB,             -- [{product_id, product_name, quantity, unit_price, total_amount, description}]
  p_idempotency_key TEXT,
  p_source TEXT DEFAULT 'manual'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_tx_id UUID;
  v_debit_code TEXT;
  v_credit_code TEXT := '4100';
  v_tx_type TEXT;
  v_amount_ils NUMERIC;
  v_remaining NUMERIC;
  v_payment_status TEXT;
  v_item JSONB;
  v_stock_result JSONB;
  v_alerts INTEGER := 0;
BEGIN
  -- Idempotency: if already done, return existing
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, invoice_number INTO v_invoice_id, v_invoice_number
    FROM public.invoices
    WHERE user_id = p_user_id AND notes LIKE '%' || p_idempotency_key || '%'
    LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true,
        'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number);
    END IF;
  END IF;

  v_remaining := p_total_amount - COALESCE(p_paid_amount, 0);
  v_payment_status := CASE
    WHEN COALESCE(p_paid_amount, 0) >= p_total_amount THEN 'مدفوع'
    WHEN COALESCE(p_paid_amount, 0) > 0 THEN 'مدفوع جزئياً'
    ELSE 'غير مدفوع'
  END;

  -- 1) Create invoice (trigger generates number atomically)
  INSERT INTO public.invoices (
    user_id, invoice_type, contact_name, contact_id, invoice_date,
    subtotal, discount_amount, tax_amount, total_amount,
    paid_amount, remaining_amount, payment_status, payment_method,
    currency, exchange_rate, status, source, notes
  ) VALUES (
    p_user_id, 'sale', p_contact_name, p_contact_id, p_invoice_date,
    p_subtotal, COALESCE(p_discount_amount, 0), COALESCE(p_tax_amount, 0), p_total_amount,
    COALESCE(p_paid_amount, 0), v_remaining, v_payment_status, p_payment_method,
    COALESCE(p_currency, 'شيكل'), COALESCE(p_exchange_rate, 1),
    'posted', COALESCE(p_source, 'manual'),
    COALESCE(p_notes, '') || CASE WHEN p_idempotency_key IS NOT NULL THEN ' [key:' || p_idempotency_key || ']' ELSE '' END
  ) RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

  -- 2) Insert items + decrement stock atomically
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.invoice_items (
        invoice_id, product_id, product_name,
        quantity, unit_price, total_amount, description
      ) VALUES (
        v_invoice_id,
        NULLIF(v_item->>'product_id', '')::UUID,
        v_item->>'product_name',
        COALESCE((v_item->>'quantity')::NUMERIC, 1),
        COALESCE((v_item->>'unit_price')::NUMERIC, 0),
        COALESCE((v_item->>'total_amount')::NUMERIC, 0),
        v_item->>'description'
      );

      -- Decrement stock if product is real
      IF NULLIF(v_item->>'product_id', '') IS NOT NULL THEN
        v_stock_result := public.decrement_stock_safe(
          p_user_id,
          (v_item->>'product_id')::UUID,
          COALESCE((v_item->>'quantity')::NUMERIC, 1),
          'invoice',
          v_invoice_number
        );
        IF (v_stock_result->>'went_negative')::BOOLEAN THEN
          v_alerts := v_alerts + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3) Build journal entry (sale)
  v_amount_ils := CASE
    WHEN p_currency != 'شيكل' AND p_exchange_rate IS NOT NULL AND p_exchange_rate != 1
    THEN p_total_amount * p_exchange_rate
    ELSE p_total_amount
  END;

  v_debit_code := CASE p_payment_method
    WHEN 'cash' THEN '1110'
    WHEN 'نقدي' THEN '1110'
    WHEN 'transfer' THEN '1120'
    WHEN 'cheque' THEN '1150'
    ELSE '1130'
  END;

  v_tx_type := CASE p_payment_method
    WHEN 'cash' THEN 'sale_cash'
    WHEN 'نقدي' THEN 'sale_cash'
    WHEN 'transfer' THEN 'sale_bank'
    WHEN 'cheque' THEN 'sale_cheque'
    ELSE 'sale_credit'
  END;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    amount, currency, foreign_amount, exchange_rate,
    transaction_type, contact_id, reference,
    payment_method, idempotency_key
  ) VALUES (
    p_user_id, p_invoice_date,
    'فاتورة مبيعات ' || v_invoice_number || ' - ' || COALESCE(p_contact_name, ''),
    v_debit_code, v_credit_code,
    v_amount_ils, COALESCE(p_currency, 'شيكل'),
    CASE WHEN p_currency != 'شيكل' AND p_exchange_rate != 1 THEN p_total_amount ELSE NULL END,
    CASE WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate != 1 THEN p_exchange_rate ELSE NULL END,
    v_tx_type, p_contact_id, v_invoice_number,
    p_payment_method,
    'INV-' || v_invoice_id::TEXT
  ) RETURNING id INTO v_tx_id;

  -- 4) Link transaction back to invoice
  UPDATE public.invoices
  SET linked_transaction_id = v_tx_id
  WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'transaction_id', v_tx_id,
    'stock_alerts_created', v_alerts
  );
EXCEPTION WHEN OTHERS THEN
  -- Re-raise; the entire transaction will rollback automatically
  RAISE EXCEPTION 'فشل إنشاء الفاتورة الذرية: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_sale_invoice_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_number TO authenticated;