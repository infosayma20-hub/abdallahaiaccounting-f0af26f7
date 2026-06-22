
-- Split-payment support for POS (cash + card combinations)
-- Backward compatible: single-tender payloads behave identically to before.

-- 1) Guard: amount must be positive on every pos_payments row
ALTER TABLE public.pos_payments
  DROP CONSTRAINT IF EXISTS pos_payments_amount_positive;
ALTER TABLE public.pos_payments
  ADD CONSTRAINT pos_payments_amount_positive CHECK (amount > 0) NOT VALID;

-- 2) Optional reference field for card approval / last-4 digits (per tender)
ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS card_reference TEXT;

-- 3) Rewrite complete_pos_order to support multiple tenders.
--    For each tender row we post one Revenue (net) + one VAT transaction,
--    proportionally split by the tender amount over order total.
--    Single-tender payloads produce identical postings to the previous version.
CREATE OR REPLACE FUNCTION public.complete_pos_order(
  p_order_id uuid, p_user_id uuid, p_payments jsonb
) RETURNS jsonb
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

  -- Validate split combinations: only cash + card (multiple card accounts allowed).
  -- credit / employee_account must remain single-tender.
  IF v_n_tenders > 1 THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payments) p
      WHERE COALESCE(p.value->>'method', 'cash') NOT IN ('cash', 'card')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error',
        'الدفع المختلط مدعوم فقط بين النقدي والفيزا');
    END IF;
    IF v_currency <> 'ILS' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'الدفع المختلط متاح حالياً بعملة الشيكل فقط');
    END IF;
  END IF;

  -- Insert pos_payments rows (one per tender)
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

  -- COGS prep
  IF NOT v_disable_cogs THEN
    SELECT COALESCE(SUM(cost_price * qty), 0) INTO v_total_cogs
    FROM public.pos_order_lines WHERE order_id = p_order_id;
  END IF;

  -- Stock movements
  IF NOT v_disable_stock THEN
    FOR v_line IN SELECT * FROM public.pos_order_lines WHERE order_id = p_order_id LOOP
      IF v_line.product_id IS NOT NULL THEN
        UPDATE public.products SET quantity = quantity - v_line.qty
        WHERE id = v_line.product_id AND user_id = p_user_id;
      END IF;
    END LOOP;
    PERFORM public._pos_sync_stock_movements(p_order_id, p_user_id, false);
  END IF;

  -- VAT split from lines (authoritative); fallback to order-level tax_amount
  SELECT
    COALESCE(SUM(GREATEST(total - COALESCE(tax_amount,0), 0)), 0),
    COALESCE(SUM(COALESCE(tax_amount,0)), 0)
  INTO v_net_total, v_vat_total
  FROM public.pos_order_lines WHERE order_id = p_order_id;

  IF v_vat_total = 0 AND COALESCE(v_order.tax_amount, 0) > 0 THEN
    v_vat_total := v_order.tax_amount;
    v_net_total := v_order.total - v_order.tax_amount;
  END IF;

  v_aggregated_method := CASE WHEN v_n_tenders > 1 THEN 'mixed' ELSE v_payment_method END;

  -- POSTINGS: one revenue + one VAT tx per tender, split proportionally.
  v_tender_idx := 0;
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_tender_idx := v_tender_idx + 1;
    v_tender_amount := COALESCE((v_payment.value->>'amount')::NUMERIC, 0);
    v_tender_method := COALESCE(v_payment.value->>'method', 'cash');

    -- Tender debit account
    IF v_tender_method = 'credit' THEN v_debit_account := '1130';
    ELSIF v_tender_method = 'card' THEN
      v_debit_account := COALESCE(v_payment.value->>'visa_gl_account_code', v_card_bank_gl, '1120');
    ELSIF v_tender_method = 'employee_account' THEN
      v_debit_account := COALESCE(v_employee_account_code, '2180');
    ELSE v_debit_account := v_box_gl_code; END IF;

    -- Proportional split. Last tender absorbs rounding residual to keep totals exact.
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

    -- 1) Revenue posting for this tender (NET)
    IF v_tender_net > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key,
        foreign_amount, exchange_rate
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number, '') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method || ')' ELSE '' END ||
          CASE WHEN v_is_foreign THEN ' [' || v_currency || ']' ELSE '' END,
        v_debit_account, v_revenue_acc,
        v_tender_net,
        v_currency_label, 'pos_sale', v_order.customer_id, v_order.order_number,
        v_tender_method, v_idempotency || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END,
        CASE WHEN v_is_foreign THEN v_foreign_amount ELSE NULL END,
        CASE WHEN v_is_foreign THEN v_rate ELSE NULL END
      ) RETURNING id INTO v_tx_id;

      IF v_first_tx_id IS NULL THEN v_first_tx_id := v_tx_id; END IF;
    END IF;

    -- 2) VAT posting for this tender
    IF v_tender_vat > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key
      ) VALUES (
        p_user_id, CURRENT_DATE,
        'ضريبة قيمة مضافة (مخرجات) - POS ' || COALESCE(v_order.order_number, '') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method || ')' ELSE '' END,
        v_debit_account, v_vat_acc,
        v_tender_vat, v_currency_label, 'pos_sale_vat', v_order.customer_id,
        v_order.order_number, v_tender_method,
        v_idempotency || '-VAT' || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END
      );
    END IF;
  END LOOP;

  -- 3) COGS (single posting regardless of tender split)
  IF v_total_cogs > 0 THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, idempotency_key
    ) VALUES (
      p_user_id, CURRENT_DATE,
      'تكلفة البضاعة المباعة - POS ' || COALESCE(v_order.order_number, ''),
      v_cogs_acc, v_inventory_acc,
      v_total_cogs, 'شيكل', 'pos_cogs',
      v_order.order_number, v_idempotency || '-COGS'
    );
  END IF;

  UPDATE public.pos_orders
  SET state = 'paid', paid_at = NOW(),
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
    'aggregated_method', v_aggregated_method,
    'tender_count', v_n_tenders
  );
END;
$function$;
