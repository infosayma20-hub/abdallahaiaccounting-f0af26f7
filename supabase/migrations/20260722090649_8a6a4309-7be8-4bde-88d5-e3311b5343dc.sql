CREATE OR REPLACE FUNCTION public.change_pos_payment_method(
  p_order_id uuid,
  p_new_method text,
  p_edit_reason text DEFAULT NULL::text,
  p_pos_user_id uuid DEFAULT NULL::uuid,
  p_manager_user_id uuid DEFAULT NULL::uuid,
  p_window_minutes integer DEFAULT 30,
  p_new_currency text DEFAULT NULL::text,
  p_new_exchange_rate numeric DEFAULT NULL::numeric,
  p_employee_id uuid DEFAULT NULL::uuid,
  p_split_payments jsonb DEFAULT NULL::jsonb,
  p_visa_gl_account_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_session public.pos_sessions%ROWTYPE;
  v_terminal public.pos_terminals%ROWTYPE;
  v_company_id uuid;
  v_caller_owner uuid;
  v_age_min numeric;
  v_old_methods text;
  v_old_currency text;
  v_old_rate numeric;
  v_old_amount numeric;
  v_old_payments jsonb;
  v_old_emp_movements jsonb;
  v_movements_revrs int := 0;
  v_pay_count int := 0;
  v_updated int := 0;
  v_gl_rows_deleted int := 0;
  v_gl_rows_inserted int := 0;
  v_new_amount numeric;
  v_new_currency_used text;
  v_new_rate numeric;
  v_split_total numeric := 0;
  v_split_row jsonb;
  v_line_method text;
  v_line_amount numeric;
  v_line_currency text;
  v_line_rate numeric;
  v_line_foreign numeric;
  v_line_change numeric;
  v_line_change_cur text;
  v_line_change_ils numeric;
  v_line_tendered_ils numeric;
  v_branch_id uuid;
  v_cash_box_exists boolean;
  v_box_gl_code text;
  v_card_bank_gl text;
  v_revenue_acc text;
  v_vat_acc text;
  v_discount_acc text;
  v_debit_account text;
  v_credit_debit_account text := '1130';
  v_contact_type text;
  v_contact_linked_code text;
  v_employee_account_code text;
  v_emp_name text;
  v_company_uuid uuid;
  v_meal_pct numeric := 50;
  v_meal_full numeric;
  v_meal_deducted numeric;
  v_net_total numeric := 0;
  v_vat_total numeric := 0;
  v_discount_amt numeric := 0;
  v_lines_subtotal numeric := 0;
  v_n_tenders int := 0;
  v_tender_idx int := 0;
  v_tender_amount numeric;
  v_tender_method text;
  v_tender_currency text;
  v_tender_rate numeric;
  v_tender_foreign numeric;
  v_tender_is_foreign boolean;
  v_tender_net numeric;
  v_tender_vat numeric;
  v_tender_share numeric;
  v_running_net numeric := 0;
  v_running_vat numeric := 0;
  v_currency_label text;
  v_tx_id uuid;
  v_first_tx_id uuid;
  v_edit_token text := floor(extract(epoch from clock_timestamp()))::text || '-' || substr(gen_random_uuid()::text, 1, 8);
BEGIN
  IF p_new_method NOT IN ('cash','card','credit','employee_account','mixed') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_method = 'employee_account' AND p_employee_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_method = 'mixed' THEN
    IF p_split_payments IS NULL OR jsonb_typeof(p_split_payments) <> 'array' OR jsonb_array_length(p_split_payments) < 2 THEN
      RAISE EXCEPTION 'SPLIT_PAYMENTS_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO v_order
  FROM public.pos_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_caller_owner := public.resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_order.user_id <> v_caller_owner THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0001';
  END IF;

  v_company_id := v_order.user_id;
  v_new_amount := COALESCE(v_order.total, 0);

  IF v_order.state <> 'paid' THEN RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(v_order.is_return, false) THEN RAISE EXCEPTION 'ORDER_IS_RETURN' USING ERRCODE = 'P0001'; END IF;
  IF v_order.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = 'P0001'; END IF;
  IF v_order.paid_at IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_PAID_AT' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_session
  FROM public.pos_sessions
  WHERE id = v_order.session_id
  FOR UPDATE;
  IF NOT FOUND OR v_session.state <> 'open' THEN
    RAISE EXCEPTION 'SESSION_NOT_OPEN' USING ERRCODE = 'P0001';
  END IF;

  v_age_min := EXTRACT(EPOCH FROM (now() - v_order.paid_at)) / 60.0;
  IF v_age_min > COALESCE(p_window_minutes, 30) AND p_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED' USING ERRCODE = 'P0001',
      HINT = format('انتهت مدة السماح (%s دقيقة) — يتطلب موافقة مدير', COALESCE(p_window_minutes, 30));
  END IF;

  SELECT * INTO v_terminal
  FROM public.pos_terminals
  WHERE id = v_session.terminal_id;

  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT gl_account_code, branch_id
      INTO v_box_gl_code, v_branch_id
    FROM public.cash_boxes
    WHERE id = v_session.cash_box_id;
  END IF;
  v_branch_id := COALESCE(v_branch_id, v_session.branch_id);
  v_box_gl_code := COALESCE(v_box_gl_code, COALESCE(v_terminal.cash_account_code, '1110'));
  v_revenue_acc := COALESCE(v_terminal.revenue_account_code, '4100');
  v_vat_acc := public._pos_vat_output_account(v_company_id);
  v_discount_acc := public._pos_resolve_discount_acc(v_company_id, v_terminal.discount_account_code);

  SELECT COALESCE(ba.gl_account_code, '1120')
    INTO v_card_bank_gl
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = v_company_id;
  v_card_bank_gl := COALESCE(v_card_bank_gl, '1120');

  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at, p.id),
         string_agg(DISTINCT p.payment_method, '+'),
         string_agg(DISTINCT COALESCE(p.currency, 'ILS'), '+'),
         avg(NULLIF(p.exchange_rate, 0)),
         sum(p.amount),
         count(*)
    INTO v_old_payments, v_old_methods, v_old_currency, v_old_rate, v_old_amount, v_pay_count
  FROM public.pos_payments p
  WHERE p.order_id = p_order_id;

  IF v_pay_count = 0 AND v_new_amount > 0 THEN
    RAISE EXCEPTION 'NO_PAYMENTS_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.customer_id IS NOT NULL THEN
    SELECT c.contact_type, NULLIF(BTRIM(c.linked_account_code), '')
      INTO v_contact_type, v_contact_linked_code
    FROM public.contacts c
    WHERE c.id = v_order.customer_id AND c.user_id = v_company_id;

    IF v_contact_linked_code IS NOT NULL THEN
      v_credit_debit_account := v_contact_linked_code;
    ELSIF v_contact_type = 'مورد' THEN
      v_credit_debit_account := '2110';
    END IF;
  END IF;

  IF p_new_method = 'employee_account' THEN
    SELECT e.full_name INTO v_emp_name
    FROM public.employees e
    WHERE e.id = p_employee_id AND e.user_id = v_company_id AND COALESCE(e.is_active, true) = true;
    IF v_emp_name IS NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    SELECT account_code INTO v_employee_account_code
    FROM public.ensure_employee_sub_account(v_company_id, p_employee_id)
    LIMIT 1;

    IF v_employee_account_code IS NULL THEN
      SELECT a.account_code INTO v_employee_account_code
      FROM public.accounts a
      WHERE a.user_id = v_company_id
        AND COALESCE(a.is_active, true) = true
        AND a.account_name = 'ذمم موظف - ' || v_emp_name
      LIMIT 1;
    END IF;

    IF v_employee_account_code IS NULL THEN
      RAISE EXCEPTION 'EMPLOYEE_ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_new_method = 'mixed' THEN
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
      v_line_method := COALESCE(v_split_row->>'method', '');
      IF v_line_method NOT IN ('cash','card','credit') THEN
        RAISE EXCEPTION 'SPLIT_INVALID_METHOD' USING ERRCODE = 'P0001';
      END IF;

      v_line_amount := COALESCE((v_split_row->>'amount')::numeric, 0);
      IF v_line_amount <= 0 THEN
        RAISE EXCEPTION 'SPLIT_INVALID_AMOUNT' USING ERRCODE = 'P0001';
      END IF;

      v_line_currency := upper(COALESCE(v_split_row->>'currency', 'ILS'));
      v_line_rate := CASE WHEN v_line_currency = 'ILS' THEN 1 ELSE COALESCE((v_split_row->>'exchange_rate')::numeric, 0) END;
      v_line_foreign := COALESCE((v_split_row->>'foreign_amount')::numeric, v_line_amount);
      v_line_change := COALESCE((v_split_row->>'change_amount')::numeric, 0);
      v_line_change_cur := upper(COALESCE(v_split_row->>'change_currency', v_line_currency));

      IF v_line_method <> 'cash' AND v_line_currency <> 'ILS' THEN
        RAISE EXCEPTION 'SPLIT_NONCASH_FOREIGN_BLOCKED' USING ERRCODE = 'P0001';
      END IF;

      IF v_line_change <= 0 THEN
        v_line_change_ils := 0;
      ELSIF v_line_change_cur = 'ILS' THEN
        v_line_change_ils := v_line_change;
      ELSIF v_line_change_cur = v_line_currency THEN
        v_line_change_ils := v_line_change * v_line_rate;
      ELSE
        RAISE EXCEPTION 'SPLIT_INVALID_CHANGE_CURRENCY' USING ERRCODE = 'P0001';
      END IF;

      IF v_line_currency = 'ILS' THEN
        IF abs(v_line_rate - 1) > 0.0001 THEN
          RAISE EXCEPTION 'SPLIT_FX_MISMATCH' USING ERRCODE = 'P0001';
        END IF;
      ELSE
        IF v_line_rate <= 0 THEN
          RAISE EXCEPTION 'INVALID_EXCHANGE_RATE' USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.currencies c
          WHERE c.user_id = v_company_id
            AND upper(c.code) = v_line_currency
            AND COALESCE(c.is_active, true) = true
        ) THEN
          RAISE EXCEPTION 'UNKNOWN_CURRENCY' USING ERRCODE = 'P0001';
        END IF;
        IF abs((v_line_foreign * v_line_rate) - v_line_amount - v_line_change_ils) > 0.01 THEN
          RAISE EXCEPTION 'SPLIT_FX_MISMATCH' USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF v_line_method = 'cash' AND v_line_currency <> 'ILS' AND v_branch_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.cash_boxes cb
          WHERE cb.user_id = v_company_id
            AND cb.branch_id = v_branch_id
            AND upper(COALESCE(cb.currency, 'ILS')) = v_line_currency
            AND COALESCE(cb.is_active, true) = true
        ) INTO v_cash_box_exists;
        IF NOT v_cash_box_exists THEN
          RAISE EXCEPTION 'CASH_BOX_MISSING_FOR_CURRENCY' USING ERRCODE = 'P0001';
        END IF;
      END IF;

      v_split_total := v_split_total + v_line_amount;
    END LOOP;

    IF abs(v_split_total - v_new_amount) > 0.01 THEN
      RAISE EXCEPTION 'SPLIT_AMOUNT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_new_currency IS NOT NULL AND p_new_method <> 'mixed' THEN
    IF p_new_method <> 'cash' AND upper(p_new_currency) <> 'ILS' THEN
      RAISE EXCEPTION 'CURRENCY_REQUIRES_CASH' USING ERRCODE = 'P0001';
    END IF;
    IF p_new_method = 'cash' AND upper(p_new_currency) <> 'ILS' THEN
      IF p_new_exchange_rate IS NULL OR p_new_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'INVALID_EXCHANGE_RATE' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.currencies c
        WHERE c.user_id = v_company_id
          AND upper(c.code) = upper(p_new_currency)
          AND COALESCE(c.is_active, true) = true
      ) THEN
        RAISE EXCEPTION 'UNKNOWN_CURRENCY' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', m.id, 'employee_id', m.employee_id, 'amount', m.amount, 'source_reference', m.source_reference))
    INTO v_old_emp_movements
  FROM public.employee_financial_movements m
  WHERE m.user_id = v_company_id
    AND m.source_type = 'pos_meal'
    AND m.source_id = p_order_id
    AND m.movement_type = 'debit'
    AND m.status = 'approved';

  IF COALESCE(v_old_methods, '') ILIKE '%employee_account%' AND p_new_method <> 'employee_account' THEN
    WITH src AS (
      SELECT m.id, m.employee_id, m.amount, m.source_reference, m.reference_number
      FROM public.employee_financial_movements m
      WHERE m.user_id = v_company_id
        AND m.source_type = 'pos_meal'
        AND m.source_id = p_order_id
        AND m.movement_type = 'debit'
        AND m.status = 'approved'
        AND NOT EXISTS (
          SELECT 1
          FROM public.employee_financial_movements r
          WHERE r.user_id = v_company_id
            AND r.source_type = 'pos_meal_reversal'
            AND r.source_id = p_order_id
            AND r.employee_id = m.employee_id
        )
    ), ins AS (
      INSERT INTO public.employee_financial_movements (
        user_id, employee_id, source_type, source_id, source_reference, reference_number,
        category, description, amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes
      )
      SELECT v_company_id, src.employee_id, 'pos_meal_reversal', p_order_id,
             src.source_reference, src.reference_number, 'food',
             format('عكس وجبة POS — تعديل طريقة الدفع (فاتورة #%s)', COALESCE(v_order.order_number, '-')),
             src.amount, 'credit', 'approved', CURRENT_DATE,
             EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, p_pos_user_id,
             format('عكس آلي لحركة pos_meal بسبب تعديل طريقة الدفع. السبب: %s | manager:%s',
                    COALESCE(p_edit_reason, '—'), COALESCE(p_manager_user_id::text, '—'))
      FROM src
      RETURNING 1
    )
    SELECT count(*) INTO v_movements_revrs FROM ins;
  END IF;

  IF p_new_method = 'employee_account'
     AND COALESCE(v_old_methods, '') NOT ILIKE '%employee_account%' THEN
    BEGIN
      SELECT id INTO v_company_uuid FROM public.companies WHERE owner_id = v_company_id LIMIT 1;
      IF v_company_uuid IS NOT NULL THEN
        SELECT COALESCE(food_individual_percentage, 50)
          INTO v_meal_pct
        FROM public.payroll_settings
        WHERE company_id = v_company_uuid
        LIMIT 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_meal_pct := 50;
    END;

    v_meal_pct := GREATEST(0, LEAST(100, COALESCE(v_meal_pct, 50)));
    v_meal_full := v_new_amount;
    v_meal_deducted := round((v_meal_full * v_meal_pct / 100.0)::numeric, 2);

    IF v_meal_deducted > 0 THEN
      INSERT INTO public.employee_financial_movements (
        user_id, employee_id, source_type, source_id, source_reference, reference_number,
        category, description, amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes,
        meal_discount_pct, original_full_amount
      ) VALUES (
        v_company_id, p_employee_id, 'pos_meal', p_order_id, v_order.order_number, v_order.order_number,
        'food', format('وجبة POS (تحويل لحساب موظف) - فاتورة #%s', COALESCE(v_order.order_number, '-')),
        v_meal_deducted, 'debit', 'approved', CURRENT_DATE,
        EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, p_pos_user_id,
        format('تحويل آلي عبر تعديل طريقة الدفع. إجمالي الفاتورة: %s | نسبة خصم الموظف: %s%% | الخصم الفعلي: %s | السبب: %s | manager:%s',
               v_meal_full::text, v_meal_pct::text, v_meal_deducted::text,
               COALESCE(p_edit_reason, '—'), COALESCE(p_manager_user_id::text, '—')),
        v_meal_pct, v_meal_full
      );
    END IF;
  END IF;

  DELETE FROM public.pos_payments
  WHERE order_id = p_order_id;

  IF p_new_method = 'mixed' THEN
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
      v_line_method := COALESCE(v_split_row->>'method', 'cash');
      v_line_amount := (v_split_row->>'amount')::numeric;
      v_line_currency := upper(COALESCE(v_split_row->>'currency', 'ILS'));
      v_line_rate := CASE WHEN v_line_currency = 'ILS' THEN 1 ELSE COALESCE((v_split_row->>'exchange_rate')::numeric, 1) END;
      v_line_foreign := COALESCE((v_split_row->>'foreign_amount')::numeric, v_line_amount);
      v_line_change := COALESCE((v_split_row->>'change_amount')::numeric, 0);
      v_line_change_cur := upper(COALESCE(v_split_row->>'change_currency', v_line_currency));
      v_line_change_ils := CASE
        WHEN v_line_change <= 0 THEN 0
        WHEN v_line_change_cur = 'ILS' THEN v_line_change
        ELSE v_line_change * v_line_rate
      END;
      v_line_tendered_ils := CASE
        WHEN v_line_method = 'cash' AND v_line_currency <> 'ILS' THEN round((v_line_foreign * v_line_rate)::numeric, 2)
        WHEN v_line_method = 'cash' THEN round((v_line_amount + v_line_change_ils)::numeric, 2)
        ELSE v_line_amount
      END;

      INSERT INTO public.pos_payments (
        user_id, order_id, payment_method, amount, tendered, change_amount,
        currency, reference, change_currency, exchange_rate, card_reference,
        original_payment_method, payment_edited_at, payment_edited_by_pos_user_id,
        payment_edit_manager_user_id, payment_edit_reason, tendered_ils, fx_rate
      ) VALUES (
        v_company_id, p_order_id, v_line_method, v_line_amount, v_line_tendered_ils, v_line_change,
        v_line_currency, v_split_row->>'reference', v_line_change_cur, v_line_rate, v_split_row->>'card_reference',
        v_old_methods, now(), p_pos_user_id, p_manager_user_id, p_edit_reason,
        v_line_tendered_ils, v_line_rate
      );
      v_updated := v_updated + 1;
    END LOOP;
  ELSE
    v_new_currency_used := CASE
      WHEN p_new_method = 'cash' THEN upper(COALESCE(p_new_currency, v_old_currency, 'ILS'))
      ELSE 'ILS'
    END;
    v_new_rate := CASE
      WHEN v_new_currency_used = 'ILS' THEN 1
      ELSE COALESCE(p_new_exchange_rate, v_old_rate, 1)
    END;

    INSERT INTO public.pos_payments (
      user_id, order_id, payment_method, amount, tendered, change_amount,
      currency, reference, change_currency, exchange_rate, card_reference,
      original_payment_method, payment_edited_at, payment_edited_by_pos_user_id,
      payment_edit_manager_user_id, payment_edit_reason, tendered_ils, fx_rate
    ) VALUES (
      v_company_id, p_order_id, p_new_method, v_new_amount, v_new_amount, 0,
      v_new_currency_used, NULL, 'ILS', v_new_rate,
      CASE WHEN p_new_method = 'card' THEN p_visa_gl_account_code ELSE NULL END,
      v_old_methods, now(), p_pos_user_id, p_manager_user_id, p_edit_reason,
      v_new_amount, v_new_rate
    );
    v_updated := 1;
  END IF;

  UPDATE public.pos_orders
     SET payment_currency = CASE WHEN p_new_method = 'mixed' THEN 'ILS'
                                 WHEN p_new_method = 'cash' THEN COALESCE(v_new_currency_used, 'ILS')
                                 ELSE 'ILS' END,
         payment_currency_rate = CASE WHEN p_new_method = 'mixed' THEN 1 ELSE COALESCE(v_new_rate, 1) END,
         payment_currency_amount = CASE
           WHEN p_new_method = 'cash' AND COALESCE(v_new_currency_used, 'ILS') <> 'ILS' AND COALESCE(v_new_rate, 0) > 0
             THEN round((v_new_amount / v_new_rate)::numeric, 2)
           ELSE v_new_amount
         END,
         currency = CASE WHEN p_new_method = 'cash' THEN COALESCE(v_new_currency_used, 'ILS') ELSE COALESCE(currency, 'ILS') END,
         updated_at = now()
   WHERE id = p_order_id;

  PERFORM set_config('app.pos_gl_repost', 'on', true);

  UPDATE public.transactions
     SET is_deleted = true,
         updated_at = now(),
         notes = CONCAT_WS(E'\n', NULLIF(notes, ''),
           format('[pos-edit-repost %s] soft-deleted before repost. from:%s to:%s reason:%s',
                  to_char(now(), 'YYYY-MM-DD HH24:MI:SS'), COALESCE(v_old_methods, '-'), p_new_method, COALESCE(p_edit_reason, '-')))
   WHERE user_id = v_company_id
     AND COALESCE(is_deleted, false) = false
     AND transaction_type IN ('pos_sale', 'pos_sale_vat', 'pos_sale_discount')
     AND (pos_order_id = p_order_id OR reference = v_order.order_number);
  GET DIAGNOSTICS v_gl_rows_deleted = ROW_COUNT;

  PERFORM set_config('app.pos_gl_repost', 'off', true);

  SELECT COALESCE(SUM(GREATEST(total - COALESCE(tax_amount, 0), 0)), 0),
         COALESCE(SUM(COALESCE(tax_amount, 0)), 0)
    INTO v_net_total, v_vat_total
  FROM public.pos_order_lines
  WHERE order_id = p_order_id;

  IF v_vat_total = 0 AND COALESCE(v_order.tax_amount, 0) > 0 THEN
    v_vat_total := v_order.tax_amount;
    v_net_total := v_new_amount - v_order.tax_amount;
  END IF;

  IF v_net_total = 0 AND v_vat_total = 0 AND v_new_amount > 0 THEN
    v_net_total := GREATEST(v_new_amount - COALESCE(v_order.tax_amount, 0), 0);
    v_vat_total := COALESCE(v_order.tax_amount, 0);
  END IF;

  v_lines_subtotal := v_net_total;
  v_discount_amt := GREATEST(COALESCE(v_order.discount_amount, 0), 0);
  IF v_discount_amt > v_lines_subtotal THEN v_discount_amt := v_lines_subtotal; END IF;
  IF v_discount_amt > 0 THEN v_net_total := v_lines_subtotal - v_discount_amt; END IF;

  IF p_new_method = 'mixed' THEN
    v_n_tenders := jsonb_array_length(p_split_payments);
  ELSE
    v_n_tenders := 1;
    p_split_payments := jsonb_build_array(jsonb_build_object(
      'method', p_new_method,
      'amount', v_new_amount,
      'currency', CASE WHEN p_new_method = 'cash' THEN COALESCE(v_new_currency_used, 'ILS') ELSE 'ILS' END,
      'exchange_rate', CASE WHEN p_new_method = 'cash' THEN COALESCE(v_new_rate, 1) ELSE 1 END,
      'foreign_amount', CASE WHEN p_new_method = 'cash' AND COALESCE(v_new_currency_used, 'ILS') <> 'ILS' AND COALESCE(v_new_rate, 0) > 0
                             THEN round((v_new_amount / v_new_rate)::numeric, 2)
                             ELSE v_new_amount END,
      'visa_gl_account_code', p_visa_gl_account_code
    ));
  END IF;

  FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
    v_tender_idx := v_tender_idx + 1;
    v_tender_method := COALESCE(v_split_row->>'method', 'cash');
    v_tender_amount := COALESCE((v_split_row->>'amount')::numeric, 0);
    v_tender_currency := upper(COALESCE(v_split_row->>'currency', 'ILS'));
    v_tender_rate := CASE WHEN v_tender_currency = 'ILS' THEN 1 ELSE COALESCE((v_split_row->>'exchange_rate')::numeric, 1) END;
    v_tender_foreign := COALESCE((v_split_row->>'foreign_amount')::numeric,
                         CASE WHEN v_tender_rate > 0 THEN v_tender_amount / v_tender_rate ELSE v_tender_amount END);
    v_tender_is_foreign := (v_tender_currency <> 'ILS' AND v_tender_method = 'cash');
    v_currency_label := CASE v_tender_currency
      WHEN 'USD' THEN 'دولار'
      WHEN 'JOD' THEN 'دينار'
      WHEN 'EUR' THEN 'يورو'
      WHEN 'EGP' THEN 'جنيه'
      WHEN 'ILS' THEN 'شيكل'
      ELSE v_tender_currency
    END;

    IF v_tender_method = 'credit' THEN
      v_debit_account := v_credit_debit_account;
    ELSIF v_tender_method = 'card' THEN
      v_debit_account := COALESCE(NULLIF(BTRIM(v_split_row->>'visa_gl_account_code'), ''), NULLIF(BTRIM(p_visa_gl_account_code), ''), v_card_bank_gl, '1120');
    ELSIF v_tender_method = 'employee_account' THEN
      v_debit_account := v_employee_account_code;
    ELSE
      v_debit_account := public._pos_resolve_cash_gl(v_session.cash_box_id, v_tender_currency, v_box_gl_code);
    END IF;

    IF v_tender_idx = v_n_tenders THEN
      v_tender_net := GREATEST(v_net_total - v_running_net, 0);
      v_tender_vat := GREATEST(v_vat_total - v_running_vat, 0);
    ELSIF v_new_amount > 0 THEN
      v_tender_share := v_tender_amount / v_new_amount;
      v_tender_net := ROUND(v_net_total * v_tender_share, 2);
      v_tender_vat := ROUND(v_vat_total * v_tender_share, 2);
      v_running_net := v_running_net + v_tender_net;
      v_running_vat := v_running_vat + v_tender_vat;
    ELSE
      v_tender_net := 0;
      v_tender_vat := 0;
    END IF;

    IF v_tender_net > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key, pos_order_id,
        foreign_amount, exchange_rate
      ) VALUES (
        v_company_id, COALESCE(v_order.paid_at::date, CURRENT_DATE),
        'مبيعات نقطة البيع - ' || COALESCE(v_order.order_number, '') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method || CASE WHEN v_tender_is_foreign THEN ' ' || v_tender_currency ELSE '' END || ')' ELSE '' END ||
          CASE WHEN v_n_tenders = 1 AND v_tender_is_foreign THEN ' [' || v_tender_currency || ']' ELSE '' END ||
          ' [تعديل دفع]',
        v_debit_account, v_revenue_acc,
        v_tender_net, v_currency_label, 'pos_sale', v_order.customer_id,
        v_order.order_number, v_tender_method,
        'POS-ORDER-' || p_order_id::text || '-PAYEDIT-' || v_edit_token || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END,
        p_order_id,
        CASE WHEN v_tender_is_foreign THEN ROUND(v_tender_foreign * (v_tender_net / NULLIF(v_tender_amount, 0)), 2) ELSE NULL END,
        CASE WHEN v_tender_is_foreign THEN v_tender_rate ELSE NULL END
      ) RETURNING id INTO v_tx_id;

      IF v_first_tx_id IS NULL THEN v_first_tx_id := v_tx_id; END IF;
      v_gl_rows_inserted := v_gl_rows_inserted + 1;
    END IF;

    IF v_tender_vat > 0 THEN
      INSERT INTO public.transactions (
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type, contact_id,
        reference, payment_method, idempotency_key, pos_order_id
      ) VALUES (
        v_company_id, COALESCE(v_order.paid_at::date, CURRENT_DATE),
        'ضريبة قيمة مضافة (مخرجات) - POS ' || COALESCE(v_order.order_number, '') ||
          CASE WHEN v_n_tenders > 1 THEN ' (' || v_tender_method || CASE WHEN v_tender_is_foreign THEN ' ' || v_tender_currency ELSE '' END || ')' ELSE '' END ||
          ' [تعديل دفع]',
        v_debit_account, v_vat_acc,
        v_tender_vat, v_currency_label, 'pos_sale_vat', v_order.customer_id,
        v_order.order_number, v_tender_method,
        'POS-ORDER-' || p_order_id::text || '-PAYEDIT-' || v_edit_token || '-VAT' || CASE WHEN v_n_tenders > 1 THEN '-T' || v_tender_idx ELSE '' END,
        p_order_id
      );
      v_gl_rows_inserted := v_gl_rows_inserted + 1;
    END IF;
  END LOOP;

  IF v_discount_amt > 0 AND v_discount_acc IS NOT NULL AND v_discount_acc <> '' THEN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type, contact_id,
      reference, payment_method, idempotency_key, pos_order_id
    ) VALUES (
      v_company_id, COALESCE(v_order.paid_at::date, CURRENT_DATE),
      'خصم مبيعات - POS ' || COALESCE(v_order.order_number, '') || ' [تعديل دفع]',
      v_discount_acc, v_revenue_acc,
      v_discount_amt, 'شيكل', 'pos_sale_discount', v_order.customer_id,
      v_order.order_number, CASE WHEN v_n_tenders > 1 THEN 'mixed' ELSE p_new_method END,
      'POS-ORDER-' || p_order_id::text || '-PAYEDIT-' || v_edit_token || '-DISC',
      p_order_id
    );
    v_gl_rows_inserted := v_gl_rows_inserted + 1;
  END IF;

  IF v_new_amount > 0 AND v_gl_rows_inserted = 0 THEN
    RAISE EXCEPTION 'GL_SYNC_NO_ROWS' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.pos_orders
     SET transaction_id = COALESCE(v_first_tx_id, transaction_id),
         updated_at = now()
   WHERE id = p_order_id;

  INSERT INTO public.pos_shift_post_close_edits (
    session_id, entity_table, entity_id, action,
    before_data, after_data, reason, performed_by_auth_user_id
  ) VALUES (
    v_order.session_id, 'pos_payments', p_order_id, 'payment_method_change',
    jsonb_build_object(
      'payments', COALESCE(v_old_payments, '[]'::jsonb),
      'methods', v_old_methods,
      'currency', v_old_currency,
      'rate', v_old_rate,
      'amount', v_old_amount,
      'employee_movements', v_old_emp_movements
    ),
    jsonb_build_object(
      'method', p_new_method,
      'currency', CASE WHEN p_new_method = 'cash' THEN COALESCE(v_new_currency_used, p_new_currency, 'ILS') ELSE 'ILS' END,
      'rate', COALESCE(v_new_rate, p_new_exchange_rate, 1),
      'employee_id', p_employee_id,
      'employee_account_code', v_employee_account_code,
      'splits', CASE WHEN p_new_method = 'mixed' THEN p_split_payments ELSE NULL END,
      'visa_gl_account_code', p_visa_gl_account_code,
      'pos_payment_rows', v_updated,
      'gl_rows_soft_deleted', v_gl_rows_deleted,
      'gl_rows_inserted', v_gl_rows_inserted,
      'employee_reversals', v_movements_revrs,
      'manager_user_id', p_manager_user_id,
      'pos_user_id', p_pos_user_id
    ),
    p_edit_reason,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'from_method', v_old_methods,
    'to_method', p_new_method,
    'from_currency', v_old_currency,
    'to_currency', CASE WHEN p_new_method = 'cash' THEN COALESCE(v_new_currency_used, p_new_currency, 'ILS') ELSE 'ILS' END,
    'rows_updated', v_updated,
    'employee_movements_reversed', v_movements_revrs,
    'gl_rows_soft_deleted', v_gl_rows_deleted,
    'gl_rows_inserted', v_gl_rows_inserted,
    'transaction_id', v_first_tx_id,
    'gl_scope', 'transactions.pos_order_id'
  );
END;
$function$;