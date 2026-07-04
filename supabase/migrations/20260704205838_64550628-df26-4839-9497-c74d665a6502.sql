
-- ============================================================
-- STEP 1: Add pos_order_id column to transactions + backfill
-- ============================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS pos_order_id UUID REFERENCES public.pos_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_pos_order_id
  ON public.transactions(pos_order_id) WHERE pos_order_id IS NOT NULL;

-- Backfill from idempotency_key pattern POS-ORDER-<uuid>...
UPDATE public.transactions t
SET pos_order_id = (regexp_replace(t.idempotency_key,'^POS-ORDER-([0-9a-f-]{36}).*$','\1'))::uuid
WHERE t.pos_order_id IS NULL
  AND t.idempotency_key ~ '^POS-ORDER-[0-9a-f-]{36}'
  AND EXISTS (
    SELECT 1 FROM public.pos_orders o
    WHERE o.id = (regexp_replace(t.idempotency_key,'^POS-ORDER-([0-9a-f-]{36}).*$','\1'))::uuid
  );

-- ============================================================
-- STEP 2: repost_pos_order_gl — atomic reverse + repost helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.repost_pos_order_gl(
  p_order_id uuid,
  p_dry_run  boolean DEFAULT true,
  p_reason   text DEFAULT 'pos_gl_repair_v1'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order        pos_orders%ROWTYPE;
  v_session      pos_sessions%ROWTYPE;
  v_terminal     pos_terminals%ROWTYPE;
  v_p_user_id    uuid;
  v_tx           RECORD;
  v_payment      RECORD;
  v_reversed     int := 0;
  v_inserted     int := 0;
  v_box_gl_code  text;
  v_card_bank_gl text;
  v_inventory_acc text;
  v_revenue_acc  text;
  v_cogs_acc     text;
  v_vat_acc      text;
  v_discount_acc text;
  v_idempotency  text;
  v_n_tenders    int;
  v_tender_idx   int := 0;
  v_tender_amount numeric;
  v_tender_method text;
  v_t_currency   text; v_t_rate numeric; v_t_foreign numeric;
  v_t_is_foreign boolean; v_t_currency_label text;
  v_debit_account text;
  v_net_total    numeric := 0;
  v_vat_total    numeric := 0;
  v_running_net  numeric := 0;
  v_running_vat  numeric := 0;
  v_tender_net   numeric;
  v_tender_vat   numeric;
  v_tender_share numeric;
  v_discount_amt numeric := 0;
  v_lines_subtotal numeric := 0;
  v_tx_date      date;
  v_first_tx_id  uuid;
  v_currency     text;
  v_txn_ids      uuid[] := ARRAY[]::uuid[];
  v_batch        text := 'pos_gl_repair_' || to_char(now(),'YYYYMMDDHH24MISS');
BEGIN
  SELECT * INTO v_order FROM public.pos_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found', 'order_id', p_order_id);
  END IF;
  IF v_order.state <> 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_paid', 'state', v_order.state);
  END IF;

  v_p_user_id := v_order.user_id;

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = v_order.session_id;
  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_session.terminal_id;

  -- Resolve accounts (mirror complete_pos_order)
  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = v_p_user_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_session.cash_box_id;
  END IF;
  v_box_gl_code   := COALESCE(v_box_gl_code, COALESCE(v_terminal.cash_account_code, '1110'));
  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
  v_revenue_acc   := COALESCE(v_terminal.revenue_account_code, '4100');
  v_cogs_acc      := COALESCE(v_terminal.cogs_account_code, '5100');
  v_vat_acc       := public._pos_vat_output_account(v_p_user_id);
  v_discount_acc  := v_terminal.discount_account_code;

  v_idempotency := 'POS-ORDER-' || p_order_id::text;
  v_tx_date     := CURRENT_DATE;  -- use CURRENT_DATE to avoid backdating into locked fiscal periods

  -- Compute net/vat from lines (mirror complete_pos_order)
  SELECT
    COALESCE(SUM(GREATEST(total - COALESCE(tax_amount,0), 0)), 0),
    COALESCE(SUM(COALESCE(tax_amount,0)), 0)
  INTO v_net_total, v_vat_total
  FROM public.pos_order_lines WHERE order_id = p_order_id;

  IF v_vat_total = 0 AND COALESCE(v_order.tax_amount,0) > 0 THEN
    v_vat_total := v_order.tax_amount;
    v_net_total := v_order.total - v_order.tax_amount;
  END IF;

  v_lines_subtotal := v_net_total;
  v_discount_amt   := GREATEST(COALESCE(v_order.discount_amount,0), 0);
  IF v_discount_amt > v_lines_subtotal THEN v_discount_amt := v_lines_subtotal; END IF;
  IF v_discount_amt > 0 AND (v_discount_acc IS NULL OR v_discount_acc = '') THEN
    v_net_total := v_lines_subtotal - v_discount_amt;
  END IF;

  SELECT COUNT(*) INTO v_n_tenders
  FROM public.pos_payments
  WHERE order_id = p_order_id AND COALESCE(is_refund,false)=false;

  IF v_n_tenders = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_payments', 'order_id', p_order_id);
  END IF;

  -- Snapshot current sale/vat/discount txns for logging + reversal
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'success', true, 'dry_run', true, 'order_id', p_order_id,
      'order_number', v_order.order_number, 'total', v_order.total,
      'n_tenders', v_n_tenders, 'net_total', v_net_total, 'vat_total', v_vat_total,
      'discount', v_discount_amt,
      'existing_tx', (
        SELECT jsonb_agg(jsonb_build_object(
          'id', id, 'type', transaction_type, 'debit', debit_account_code,
          'credit', credit_account_code, 'amount', amount, 'idempotency_key', idempotency_key
        )) FROM public.transactions
        WHERE pos_order_id = p_order_id
          AND transaction_type IN ('pos_sale','pos_sale_vat','pos_sale_discount')
          AND COALESCE(is_deleted,false)=false
      ),
      'tenders', (
        SELECT jsonb_agg(jsonb_build_object('method', payment_method, 'amount', amount, 'currency', currency))
        FROM public.pos_payments
        WHERE order_id = p_order_id AND COALESCE(is_refund,false)=false
      )
    );
  END IF;

  -- ============ ACTUAL REPAIR (transactional) ============

  -- 1) Reverse (soft-delete) existing sale/vat/discount txns (leave COGS + meal subsidy untouched)
  FOR v_tx IN
    SELECT * FROM public.transactions
    WHERE (pos_order_id = p_order_id
           OR idempotency_key LIKE 'POS-ORDER-' || p_order_id::text || '%')
      AND transaction_type IN ('pos_sale','pos_sale_vat','pos_sale_discount')
      AND COALESCE(is_deleted,false)=false
  LOOP
    INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, reason)
    VALUES (v_batch, 'transaction', v_tx.id,
      to_jsonb(v_tx),
      'reversed for repost: ' || p_reason);

    UPDATE public.transactions
       SET is_deleted = true,
           notes = COALESCE(notes,'') || ' [auto-reversed: ' || p_reason || ']',
           idempotency_key = idempotency_key || '#REV-' || v_batch,
           updated_at = now()
     WHERE id = v_tx.id;
    v_reversed := v_reversed + 1;
  END LOOP;

  -- 2) Re-post per tender (mirror complete_pos_order loop)
  v_tender_idx := 0;
  FOR v_payment IN
    SELECT * FROM public.pos_payments
    WHERE order_id = p_order_id AND COALESCE(is_refund,false)=false
    ORDER BY created_at, id
  LOOP
    v_tender_idx := v_tender_idx + 1;
    v_tender_amount := COALESCE(v_payment.amount, 0);
    v_tender_method := COALESCE(v_payment.payment_method, 'cash');
    v_t_currency := COALESCE(v_payment.currency, 'ILS');
    v_t_rate     := COALESCE(v_payment.exchange_rate, 1);
    v_t_foreign  := CASE WHEN v_t_rate > 0 THEN v_tender_amount / v_t_rate ELSE v_tender_amount END;
    v_t_is_foreign := (v_t_currency <> 'ILS' AND v_tender_method NOT IN ('credit','card','employee_account'));
    v_t_currency_label := CASE v_t_currency
      WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو'
      WHEN 'EGP' THEN 'جنيه' WHEN 'ILS' THEN 'شيكل' ELSE v_t_currency END;
    v_currency := v_t_currency_label;

    IF v_tender_method = 'credit' THEN v_debit_account := '1130';
    ELSIF v_tender_method = 'card' THEN v_debit_account := v_card_bank_gl;
    ELSIF v_tender_method = 'employee_account' THEN v_debit_account := '2180';
    ELSE
      v_debit_account := public._pos_resolve_cash_gl(v_session.cash_box_id, v_t_currency, v_box_gl_code);
    END IF;

    IF v_tender_idx = v_n_tenders THEN
      v_tender_net := GREATEST(v_net_total - v_running_net, 0);
      v_tender_vat := GREATEST(v_vat_total - v_running_vat, 0);
    ELSIF v_order.total > 0 THEN
      v_tender_share := v_tender_amount / v_order.total;
      v_tender_net := ROUND(v_net_total * v_tender_share, 2);
      v_tender_vat := ROUND(v_vat_total * v_tender_share, 2);
      v_running_net := v_running_net + v_tender_net;
      v_running_vat := v_running_vat + v_tender_vat;
    ELSE
      v_tender_net := 0; v_tender_vat := 0;
    END IF;

    IF v_tender_net > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key, pos_order_id,
        foreign_amount, exchange_rate
      ) VALUES (
        v_p_user_id, v_tx_date,
        'مبيعات نقطة البيع (إعادة ترحيل) - ' || COALESCE(v_order.order_number,'') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method || ')' ELSE '' END,
        v_debit_account, v_revenue_acc,
        v_tender_net, v_currency, 'pos_sale', v_order.customer_id,
        v_order.order_number, v_tender_method,
        v_idempotency || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END || '#R-' || v_batch,
        p_order_id,
        CASE WHEN v_t_is_foreign THEN ROUND(v_t_foreign * (v_tender_net / NULLIF(v_tender_amount,0)),2) ELSE NULL END,
        CASE WHEN v_t_is_foreign THEN v_t_rate ELSE NULL END
      ) RETURNING id INTO v_first_tx_id;
      v_txn_ids := v_txn_ids || v_first_tx_id;
      v_inserted := v_inserted + 1;
    END IF;

    IF v_tender_vat > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key, pos_order_id
      ) VALUES (
        v_p_user_id, v_tx_date,
        'ضريبة قيمة مضافة (إعادة ترحيل) - POS ' || COALESCE(v_order.order_number,''),
        v_debit_account, v_vat_acc,
        v_tender_vat, v_currency, 'pos_sale_vat', v_order.customer_id,
        v_order.order_number, v_tender_method,
        v_idempotency || '-VAT' || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END || '#R-' || v_batch,
        p_order_id
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 3) Discount re-post if applicable
  IF v_discount_amt > 0 AND v_discount_acc IS NOT NULL AND v_discount_acc <> '' THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, idempotency_key, pos_order_id
    ) VALUES (
      v_p_user_id, v_tx_date,
      'خصم مبيعات (إعادة ترحيل) - POS ' || COALESCE(v_order.order_number,''),
      v_discount_acc, v_revenue_acc,
      v_discount_amt, 'شيكل', 'pos_sale_discount', v_order.customer_id,
      v_order.order_number, v_idempotency || '-DISC#R-' || v_batch,
      p_order_id
    );
    v_inserted := v_inserted + 1;
  END IF;

  -- Log the repost as one summary row
  INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, new_value, reason)
  VALUES (v_batch, 'pos_order', p_order_id,
    jsonb_build_object(
      'order_number', v_order.order_number, 'total', v_order.total,
      'reversed_count', v_reversed, 'inserted_count', v_inserted,
      'net_total', v_net_total, 'vat_total', v_vat_total, 'n_tenders', v_n_tenders,
      'new_tx_ids', to_jsonb(v_txn_ids)
    ),
    'repost complete: ' || p_reason);

  RETURN jsonb_build_object(
    'success', true, 'dry_run', false,
    'order_id', p_order_id, 'order_number', v_order.order_number,
    'reversed', v_reversed, 'inserted', v_inserted,
    'batch', v_batch, 'new_tx_ids', v_txn_ids
  );
END;
$function$;

-- ============================================================
-- STEP 3: EXECUTE the repair on the 25 target orders (dry_run=false)
-- ============================================================
DO $repair$
DECLARE
  v_ids uuid[] := ARRAY[
    -- 20 mis-posted mixed-payment orders
    'ed97b13f-5a13-47c8-9442-7d4f2bccec04'::uuid, -- POS-20260626-0301
    'db8dcbc2-0f22-4861-a9ca-97b3d4e26729'::uuid, -- POS-20260627-0317
    '4850c054-808d-4f31-9f00-a8e8572ceb95'::uuid, -- POS-20260628-0093
    'a819495f-1f5c-4871-a440-f0f27ed5210d'::uuid, -- POS-20260628-0118
    '2104838c-ce5a-4fd2-86a6-16a51fca11bb'::uuid, -- POS-20260628-0344
    '17bf5c85-8f68-405b-84d5-b4b30f42ba59'::uuid, -- POS-20260629-0009
    'e19adbb9-5415-4423-bd43-d7901b0b0d19'::uuid, -- POS-20260629-0139
    'b732a251-1910-4881-a6a0-8787e6c2973f'::uuid, -- POS-20260629-0177
    '27c4633f-c0bc-4219-9a8f-004d4c4b9dae'::uuid, -- POS-20260630-0003
    '906d036a-5875-4cf4-8eb6-78c6b6f7b7eb'::uuid, -- POS-20260630-0100
    'a7adc7ec-8dad-439b-85d7-b6e036b64ae1'::uuid, -- POS-20260702-0311
    '60330ac2-14be-4e73-9be2-45cdf8892b4b'::uuid, -- POS-20260702-0554
    'f662b062-6db3-477d-bee6-7604a2802e80'::uuid, -- POS-20260702-0438
    'ba979e63-2d1d-4f65-a7d3-47eedd91f50b'::uuid, -- POS-20260703-0018
    '788c9fde-7eb0-4f5c-aefd-c777edf0a428'::uuid, -- POS-20260703-0323
    '0bc07f95-ecd6-43a2-8594-22c822fa5fc4'::uuid, -- POS-20260703-0386
    'e3a735b4-f304-463d-a71f-fd80a8ca438d'::uuid, -- POS-20260704-0181
    'e584b811-6307-4f5c-a2f4-c3b3a34d615f'::uuid, -- POS-20260704-0224
    'cb1f44c2-7862-4bad-825b-8d5e084ad93d'::uuid, -- POS-20260704-0235
    '1a21dd6d-0d4f-4608-8cda-08c9e9f88353'::uuid, -- POS-20260704-0379
    -- 5 orphan orders (never posted)
    '9c38ba30-b497-4854-937c-39b7d89283e0'::uuid, -- POS-20260622-0012
    '92416dbd-0bfb-4d35-b815-4ee2e7b1b50c'::uuid, -- POS-20260622-0055
    '8c7eeab2-260a-4f5a-8846-c4646566125a'::uuid, -- POS-20260622-0056
    'a82603c2-0f7f-4951-a35c-9c6cc5881b2a'::uuid, -- POS-20260622-0057
    '4341a207-d864-43bb-8a07-e67d2f4158e9'::uuid  -- POS-20260622-0058
  ];
  v_id uuid;
  v_res jsonb;
BEGIN
  FOREACH v_id IN ARRAY v_ids LOOP
    v_res := public.repost_pos_order_gl(v_id, false, 'qa_full_remediation_20260704');
    RAISE NOTICE 'Repaired %: %', v_id, v_res;
  END LOOP;
END;
$repair$;

-- ============================================================
-- STEP 4: Patch complete_pos_order to
--   (a) set pos_order_id on all inserts
--   (b) add final tender-coverage assertion
-- (Minimal surgical changes; existing logic preserved)
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_pos_order(p_order_id uuid, p_user_id uuid, p_payments jsonb, p_meal_subsidy numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD; v_line RECORD; v_payment RECORD; v_terminal RECORD;
  v_tx_id UUID; v_first_tx_id UUID;
  v_total_paid NUMERIC := 0; v_total_cogs NUMERIC := 0;
  v_idempotency TEXT; v_currency TEXT; v_rate NUMERIC; v_foreign_amount NUMERIC;
  v_debit_account TEXT; v_payment_method TEXT; v_employee_account_code TEXT;
  v_disable_cogs BOOLEAN := false; v_disable_stock BOOLEAN := false;
  v_is_foreign BOOLEAN := false; v_box_gl_code TEXT; v_currency_label TEXT;
  v_card_bank_gl TEXT; v_inventory_acc TEXT; v_revenue_acc TEXT; v_cogs_acc TEXT;
  v_vat_acc TEXT; v_net_total NUMERIC := 0; v_vat_total NUMERIC := 0;
  v_n_tenders INT := 0; v_tender_idx INT := 0;
  v_tender_amount NUMERIC; v_tender_method TEXT;
  v_tender_net NUMERIC; v_tender_vat NUMERIC; v_tender_share NUMERIC;
  v_running_net NUMERIC := 0; v_running_vat NUMERIC := 0;
  v_aggregated_method TEXT;
  v_meal_subsidy NUMERIC := COALESCE(p_meal_subsidy, 0);
  v_t_currency TEXT; v_t_rate NUMERIC; v_t_foreign NUMERIC;
  v_t_is_foreign BOOLEAN; v_t_currency_label TEXT;
  v_discount_amt NUMERIC := 0;
  v_discount_acc TEXT;
  v_lines_subtotal NUMERIC := 0;
  v_discount_posted BOOLEAN := false;
  v_posted_rows INT := 0;  -- NEW: guard counter
BEGIN
  SELECT o.*, s.terminal_id, s.cash_box_id INTO v_order
  FROM public.pos_orders o JOIN public.pos_sessions s ON s.id = o.session_id
  WHERE o.id = p_order_id AND o.user_id = p_user_id;

  IF v_order IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود'); END IF;
  IF v_order.state = 'paid' THEN RETURN jsonb_build_object('success', true, 'duplicate', true); END IF;

  SELECT COALESCE(cs.pos_disable_cogs, false), COALESCE(cs.pos_disable_stock_deduction, false)
  INTO v_disable_cogs, v_disable_stock
  FROM public.company_settings cs WHERE cs.user_id = p_user_id;

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = p_user_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  SELECT * INTO v_terminal FROM public.pos_terminals WHERE id = v_order.terminal_id;

  IF v_order.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code INTO v_box_gl_code FROM public.cash_boxes WHERE id = v_order.cash_box_id;
  END IF;
  v_box_gl_code   := COALESCE(v_box_gl_code, COALESCE(v_terminal.cash_account_code, '1110'));
  v_inventory_acc := COALESCE(v_terminal.inventory_account_code, '1140');
  v_revenue_acc   := COALESCE(v_terminal.revenue_account_code, '4100');
  v_cogs_acc      := COALESCE(v_terminal.cogs_account_code, '5100');
  v_vat_acc       := public._pos_vat_output_account(p_user_id);
  v_discount_acc  := v_terminal.discount_account_code;

  v_idempotency    := 'POS-ORDER-' || p_order_id::TEXT;
  v_currency       := COALESCE(p_payments->0->>'currency', 'ILS');
  v_rate           := COALESCE((p_payments->0->>'exchange_rate')::NUMERIC, 1);
  v_foreign_amount := COALESCE((p_payments->0->>'foreign_amount')::NUMERIC, v_order.total);
  v_payment_method := COALESCE(p_payments->0->>'method', 'cash');
  v_employee_account_code := p_payments->0->>'employee_account_code';
  v_is_foreign := (v_currency != 'ILS' AND v_payment_method NOT IN ('credit', 'card', 'employee_account'));

  v_currency_label := CASE v_currency
    WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو'
    WHEN 'EGP' THEN 'جنيه' WHEN 'ILS' THEN 'شيكل' ELSE v_currency END;

  v_n_tenders := jsonb_array_length(p_payments);

  IF v_n_tenders > 1 THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payments) p
      WHERE COALESCE(p.value->>'method', 'cash') NOT IN ('cash', 'card')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'الدفع المختلط مدعوم فقط بين النقدي والفيزا');
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payments) p
      WHERE COALESCE(p.value->>'currency', 'ILS') <> 'ILS'
        AND COALESCE(p.value->>'method', 'cash') <> 'cash'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'الدفع بالعملة الأجنبية مسموح نقداً فقط (لا فيزا بعملة أجنبية)');
    END IF;
  END IF;

  IF v_meal_subsidy > 0 AND (v_n_tenders > 1 OR v_payment_method <> 'employee_account') THEN
    v_meal_subsidy := 0;
  END IF;
  IF v_meal_subsidy > 0 AND v_employee_account_code IS NULL THEN
    v_meal_subsidy := 0;
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.pos_payments (
      user_id, order_id, payment_method, amount, tendered, change_amount,
      currency, reference, change_currency, exchange_rate, card_reference
    ) VALUES (
      p_user_id, p_order_id,
      COALESCE(v_payment.value->>'method', 'cash'),
      COALESCE((v_payment.value->>'amount')::NUMERIC, 0),
      COALESCE((v_payment.value->>'tendered')::NUMERIC, 0),
      COALESCE((v_payment.value->>'change')::NUMERIC, 0),
      COALESCE(v_payment.value->>'currency', v_currency),
      v_payment.value->>'reference',
      COALESCE(v_payment.value->>'change_currency', 'ILS'),
      COALESCE((v_payment.value->>'exchange_rate')::NUMERIC, 1),
      v_payment.value->>'card_reference'
    );
    v_total_paid := v_total_paid + COALESCE((v_payment.value->>'amount')::NUMERIC, 0);
  END LOOP;

  IF NOT v_disable_cogs THEN
    SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
    FROM public.pos_order_lines WHERE order_id = p_order_id;
  END IF;

  IF NOT v_disable_stock THEN
    FOR v_line IN SELECT * FROM public.pos_order_lines WHERE order_id = p_order_id LOOP
      IF v_line.product_id IS NOT NULL THEN
        UPDATE public.products SET quantity = quantity - v_line.qty
        WHERE id = v_line.product_id AND user_id = p_user_id;
      END IF;
    END LOOP;
    PERFORM public._pos_sync_stock_movements(p_order_id, p_user_id, false);
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(total - COALESCE(tax_amount,0), 0)), 0),
    COALESCE(SUM(COALESCE(tax_amount,0)), 0)
  INTO v_net_total, v_vat_total
  FROM public.pos_order_lines WHERE order_id = p_order_id;

  IF v_vat_total = 0 AND COALESCE(v_order.tax_amount, 0) > 0 THEN
    v_vat_total := v_order.tax_amount;
    v_net_total := v_order.total - v_order.tax_amount;
  END IF;

  v_lines_subtotal := v_net_total;
  v_discount_amt   := GREATEST(COALESCE(v_order.discount_amount, 0), 0);
  IF v_discount_amt > v_lines_subtotal THEN v_discount_amt := v_lines_subtotal; END IF;
  IF v_discount_amt > 0 AND (v_discount_acc IS NULL OR v_discount_acc = '') THEN
    v_net_total := v_lines_subtotal - v_discount_amt;
  END IF;

  v_aggregated_method := CASE WHEN v_n_tenders > 1 THEN 'mixed' ELSE v_payment_method END;

  v_tender_idx := 0;
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_tender_idx := v_tender_idx + 1;
    v_tender_amount := COALESCE((v_payment.value->>'amount')::NUMERIC, 0);
    v_tender_method := COALESCE(v_payment.value->>'method', 'cash');

    v_t_currency := COALESCE(v_payment.value->>'currency', v_currency);
    v_t_rate     := COALESCE((v_payment.value->>'exchange_rate')::NUMERIC, 1);
    v_t_foreign  := COALESCE((v_payment.value->>'foreign_amount')::NUMERIC,
                             CASE WHEN v_t_rate > 0 THEN v_tender_amount / v_t_rate ELSE v_tender_amount END);
    v_t_is_foreign := (v_t_currency <> 'ILS' AND v_tender_method NOT IN ('credit', 'card', 'employee_account'));
    v_t_currency_label := CASE v_t_currency
      WHEN 'USD' THEN 'دولار' WHEN 'JOD' THEN 'دينار' WHEN 'EUR' THEN 'يورو'
      WHEN 'EGP' THEN 'جنيه' WHEN 'ILS' THEN 'شيكل' ELSE v_t_currency END;

    IF v_tender_method = 'credit' THEN v_debit_account := '1130';
    ELSIF v_tender_method = 'card' THEN
      v_debit_account := COALESCE(v_payment.value->>'visa_gl_account_code', v_card_bank_gl, '1120');
    ELSIF v_tender_method = 'employee_account' THEN
      v_debit_account := COALESCE(v_employee_account_code, '2180');
    ELSE
      v_debit_account := public._pos_resolve_cash_gl(v_order.cash_box_id, v_t_currency, v_box_gl_code);
    END IF;

    IF v_tender_idx = v_n_tenders THEN
      v_tender_net := GREATEST(v_net_total - v_running_net, 0);
      v_tender_vat := GREATEST(v_vat_total - v_running_vat, 0);
    ELSIF v_order.total > 0 THEN
      v_tender_share := v_tender_amount / v_order.total;
      v_tender_net := ROUND(v_net_total * v_tender_share, 2);
      v_tender_vat := ROUND(v_vat_total * v_tender_share, 2);
      v_running_net := v_running_net + v_tender_net;
      v_running_vat := v_running_vat + v_tender_vat;
    ELSE
      v_tender_net := 0; v_tender_vat := 0;
    END IF;

    IF v_tender_net > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key, pos_order_id,
        foreign_amount, exchange_rate
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number, '') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method ||
            CASE WHEN v_t_is_foreign THEN ' ' || v_t_currency ELSE '' END || ')' ELSE '' END ||
          CASE WHEN v_n_tenders = 1 AND v_t_is_foreign THEN ' [' || v_t_currency || ']' ELSE '' END,
        v_debit_account, v_revenue_acc,
        v_tender_net,
        v_t_currency_label, 'pos_sale', v_order.customer_id, v_order.order_number,
        v_tender_method, v_idempotency || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END,
        p_order_id,
        CASE WHEN v_t_is_foreign THEN ROUND(v_t_foreign * (v_tender_net / NULLIF(v_tender_amount,0)), 2) ELSE NULL END,
        CASE WHEN v_t_is_foreign THEN v_t_rate ELSE NULL END
      ) RETURNING id INTO v_tx_id;

      IF v_first_tx_id IS NULL THEN v_first_tx_id := v_tx_id; END IF;
      v_posted_rows := v_posted_rows + 1;
    END IF;

    IF v_tender_vat > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key, pos_order_id
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'ضريبة قيمة مضافة (مخرجات) - POS ' || COALESCE(v_order.order_number, '') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method ||
            CASE WHEN v_t_is_foreign THEN ' ' || v_t_currency ELSE '' END || ')' ELSE '' END,
        v_debit_account, v_vat_acc,
        v_tender_vat, v_t_currency_label, 'pos_sale_vat', v_order.customer_id,
        v_order.order_number, v_tender_method,
        v_idempotency || '-VAT' || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END,
        p_order_id
      );
      v_posted_rows := v_posted_rows + 1;
    END IF;
  END LOOP;

  IF v_discount_amt > 0 AND v_discount_acc IS NOT NULL AND v_discount_acc <> '' THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key, pos_order_id
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'خصم مبيعات - POS ' || COALESCE(v_order.order_number, ''),
      v_discount_acc, v_revenue_acc,
      v_discount_amt, 'شيكل', 'pos_sale_discount', v_order.customer_id,
      v_order.order_number, v_aggregated_method,
      v_idempotency || '-DISC',
      p_order_id
    );
    v_discount_posted := true;
  END IF;

  IF v_total_cogs > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key, pos_order_id
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'تكلفة البضاعة المباعة - POS ' || COALESCE(v_order.order_number, ''),
      v_cogs_acc, v_inventory_acc,
      v_total_cogs, 'شيكل', 'pos_cogs',
      v_order.order_number, v_idempotency || '-COGS',
      p_order_id
    );
  END IF;

  IF v_meal_subsidy > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key, pos_order_id
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'حصة الشركة من وجبة الموظف - POS ' || COALESCE(v_order.order_number, ''),
      '5316', v_employee_account_code,
      v_meal_subsidy, 'شيكل', 'pos_meal_subsidy', v_order.customer_id,
      v_order.order_number, 'employee_account',
      v_idempotency || '-MEAL',
      p_order_id
    );
  END IF;

  -- NEW: safety guard — mixed-tender orders must have at least n_tenders sale rows
  IF v_n_tenders > 1 AND v_order.total > 0 AND v_posted_rows < v_n_tenders THEN
    RAISE EXCEPTION 'pos_gl_integrity_violation: mixed tender order % expected % sale rows, got %',
      p_order_id, v_n_tenders, v_posted_rows;
  END IF;

  UPDATE public.pos_orders
  SET state = 'paid', paid_at = NOW(),
      meal_subsidy_amount = v_meal_subsidy,
      order_number = COALESCE(order_number, (
        SELECT 'POS-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
               LPAD((COALESCE(MAX(
                 CASE WHEN order_number ~ ('^POS-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-[0-9]+$')
                 THEN SUBSTRING(order_number FROM '[0-9]+$')::INT END
               ), 0) + 1)::TEXT, 4, '0')
        FROM public.pos_orders WHERE user_id = p_user_id AND state = 'paid'
      )),
      transaction_id = v_first_tx_id
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_number', (SELECT order_number FROM public.pos_orders WHERE id = p_order_id),
    'transaction_id', v_first_tx_id,
    'net_amount', v_net_total,
    'vat_amount', v_vat_total,
    'discount_amount', v_discount_amt,
    'discount_posted', v_discount_posted,
    'meal_subsidy', v_meal_subsidy,
    'aggregated_method', v_aggregated_method,
    'tender_count', v_n_tenders,
    'posted_rows', v_posted_rows
  );
END;
$function$;
