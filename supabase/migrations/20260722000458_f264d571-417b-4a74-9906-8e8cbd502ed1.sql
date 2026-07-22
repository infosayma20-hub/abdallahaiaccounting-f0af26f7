CREATE OR REPLACE FUNCTION public.change_pos_payment_method(p_order_id uuid, p_new_method text, p_edit_reason text DEFAULT NULL::text, p_pos_user_id uuid DEFAULT NULL::uuid, p_manager_user_id uuid DEFAULT NULL::uuid, p_window_minutes integer DEFAULT 30, p_new_currency text DEFAULT NULL::text, p_new_exchange_rate numeric DEFAULT NULL::numeric, p_employee_id uuid DEFAULT NULL::uuid, p_split_payments jsonb DEFAULT NULL::jsonb, p_visa_gl_account_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order pos_orders%ROWTYPE; v_session pos_sessions%ROWTYPE;
  v_company_id uuid; v_age_min numeric;
  v_old_methods text; v_old_currency text; v_old_rate numeric; v_old_amount numeric;
  v_updated int := 0; v_caller_owner uuid; v_pay_count int; v_new_amount numeric;
  v_split_total numeric := 0; v_split_row jsonb; v_emp_name text;
  v_movements_revrs int := 0; v_old_emp_movements jsonb;
  v_meal_pct numeric; v_meal_full numeric; v_meal_deducted numeric;
  v_company_uuid uuid;
  v_gl_rows_updated int := 0; v_gl_rows_deleted int := 0; v_gl_rows_inserted int := 0;
  v_line_currency text; v_line_rate numeric; v_line_foreign numeric; v_line_amount numeric;
  v_line_change numeric; v_line_change_cur text; v_line_change_ils numeric;
  v_branch_id uuid; v_cash_box_exists boolean;
BEGIN
  IF p_new_method NOT IN ('cash','card','credit','employee_account','mixed') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE = 'P0001'; END IF;
  IF p_new_method = 'employee_account' AND p_employee_id IS NULL THEN
    RAISE EXCEPTION 'EMPLOYEE_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF p_new_method = 'mixed' THEN
    IF p_split_payments IS NULL OR jsonb_typeof(p_split_payments) <> 'array' OR jsonb_array_length(p_split_payments) < 2 THEN
      RAISE EXCEPTION 'SPLIT_PAYMENTS_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT * INTO v_order FROM pos_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_caller_owner := resolve_effective_owner_id(auth.uid());
  IF v_caller_owner IS NULL OR v_order.user_id <> v_caller_owner THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'P0001'; END IF;
  v_company_id := v_order.user_id;

  IF v_order.state <> 'paid' THEN RAISE EXCEPTION 'ORDER_NOT_PAID' USING ERRCODE = 'P0001'; END IF;
  IF v_order.is_return THEN RAISE EXCEPTION 'ORDER_IS_RETURN' USING ERRCODE = 'P0001'; END IF;
  IF v_order.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_CANCELLED' USING ERRCODE = 'P0001'; END IF;
  IF v_order.paid_at IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_PAID_AT' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_session FROM pos_sessions WHERE id = v_order.session_id FOR UPDATE;
  IF NOT FOUND OR v_session.state <> 'open' THEN
    RAISE EXCEPTION 'SESSION_NOT_OPEN' USING ERRCODE = 'P0001'; END IF;

  v_age_min := EXTRACT(EPOCH FROM (now() - v_order.paid_at)) / 60.0;
  IF v_age_min > p_window_minutes AND p_manager_user_id IS NULL THEN
    RAISE EXCEPTION 'WINDOW_EXPIRED' USING ERRCODE = 'P0001',
      HINT = format('انتهت مدة السماح (%s دقيقة) — يتطلب موافقة مدير', p_window_minutes); END IF;

  IF p_new_method = 'employee_account' THEN
    SELECT full_name INTO v_emp_name FROM employees WHERE id = p_employee_id AND user_id = v_company_id;
    IF v_emp_name IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF v_session.cash_box_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM public.cash_boxes WHERE id = v_session.cash_box_id;
  END IF;

  IF p_new_method = 'mixed' THEN
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
      IF COALESCE(v_split_row->>'method','') NOT IN ('cash','card','credit') THEN
        RAISE EXCEPTION 'SPLIT_INVALID_METHOD' USING ERRCODE = 'P0001',
          HINT = 'الدفع المختلط يدعم فقط: نقدي / بطاقة / آجل'; END IF;
      v_line_amount := COALESCE((v_split_row->>'amount')::numeric, 0);
      IF v_line_amount <= 0 THEN
        RAISE EXCEPTION 'SPLIT_INVALID_AMOUNT' USING ERRCODE = 'P0001'; END IF;
      v_split_total := v_split_total + v_line_amount;

      v_line_currency := upper(COALESCE(v_split_row->>'currency', 'ILS'));
      v_line_rate     := COALESCE((v_split_row->>'exchange_rate')::numeric, 1);
      v_line_foreign  := COALESCE((v_split_row->>'foreign_amount')::numeric, v_line_amount);
      v_line_change   := COALESCE((v_split_row->>'change_amount')::numeric, 0);
      v_line_change_cur := upper(COALESCE(v_split_row->>'change_currency', v_line_currency));

      -- change_ils_eq: قيمة الباقي معبَّرة بالشيكل
      IF v_line_change <= 0 THEN
        v_line_change_ils := 0;
      ELSIF v_line_change_cur = 'ILS' THEN
        v_line_change_ils := v_line_change;
      ELSIF v_line_change_cur = v_line_currency THEN
        v_line_change_ils := v_line_change * v_line_rate;
      ELSE
        RAISE EXCEPTION 'SPLIT_INVALID_CHANGE_CURRENCY' USING ERRCODE = 'P0001',
          HINT = format('الباقي يجب أن يكون بعملة السطر (%s) أو بالشيكل — تلقّينا %s',
                        v_line_currency, v_line_change_cur);
      END IF;

      IF v_line_currency = 'ILS' THEN
        IF v_line_change > 0 THEN
          IF v_line_change_cur <> 'ILS' THEN
            RAISE EXCEPTION 'SPLIT_INVALID_CHANGE_CURRENCY' USING ERRCODE='P0001'; END IF;
          IF abs(v_line_foreign - v_line_amount) > 0.01 OR abs(v_line_rate - 1) > 0.0001 THEN
            RAISE EXCEPTION 'SPLIT_FX_MISMATCH' USING ERRCODE='P0001',
              HINT='سطر بالشيكل: exchange_rate=1 و foreign_amount=amount'; END IF;
        ELSE
          IF abs(v_line_foreign - v_line_amount) > 0.01 OR abs(v_line_rate - 1) > 0.0001 THEN
            RAISE EXCEPTION 'SPLIT_FX_MISMATCH' USING ERRCODE = 'P0001',
              HINT = 'سطر بالشيكل يجب أن يكون سعر الصرف 1 والمبلغ الأجنبي مساوٍ للمبلغ'; END IF;
        END IF;
      ELSE
        IF v_line_rate IS NULL OR v_line_rate <= 0 THEN
          RAISE EXCEPTION 'INVALID_EXCHANGE_RATE' USING ERRCODE = 'P0001',
            HINT = format('سعر صرف غير صالح لعملة %s', v_line_currency); END IF;
        IF abs((v_line_foreign * v_line_rate) - v_line_amount - v_line_change_ils) > 0.01 THEN
          RAISE EXCEPTION 'SPLIT_FX_MISMATCH' USING ERRCODE = 'P0001',
            HINT = format('عدم تطابق: %s %s × %s ≠ %s ₪ + باقي %s ₪',
                          v_line_foreign, v_line_currency, v_line_rate, v_line_amount, v_line_change_ils); END IF;
        IF NOT EXISTS (SELECT 1 FROM currencies WHERE user_id = v_company_id AND upper(code) = v_line_currency) THEN
          RAISE EXCEPTION 'UNKNOWN_CURRENCY' USING ERRCODE = 'P0001',
            HINT = format('العملة %s غير معرفة', v_line_currency); END IF;
      END IF;

      IF (v_split_row->>'method') = 'cash' AND v_line_currency <> 'ILS' AND v_branch_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.cash_boxes
           WHERE user_id = v_company_id AND branch_id = v_branch_id
             AND upper(currency) = v_line_currency AND COALESCE(is_active, true) = true
        ) INTO v_cash_box_exists;
        IF NOT v_cash_box_exists THEN
          RAISE EXCEPTION 'CASH_BOX_MISSING_FOR_CURRENCY' USING ERRCODE = 'P0001',
            HINT = format('لا يوجد صندوق %s معرَّف لهذا الفرع — أضِفه من شجرة الحسابات أولاً', v_line_currency);
        END IF;
      END IF;

      IF (v_split_row->>'method') = 'cash' AND v_line_change_ils > 0 AND v_line_change_cur = 'ILS'
         AND v_line_currency <> 'ILS' AND v_branch_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 FROM public.cash_boxes
           WHERE user_id = v_company_id AND branch_id = v_branch_id
             AND upper(currency) = 'ILS' AND COALESCE(is_active, true) = true
        ) INTO v_cash_box_exists;
        IF NOT v_cash_box_exists THEN
          RAISE EXCEPTION 'CASH_BOX_MISSING_FOR_CURRENCY' USING ERRCODE = 'P0001',
            HINT = 'لا يوجد صندوق شيكل معرَّف لهذا الفرع لإخراج الباقي منه';
        END IF;
      END IF;
    END LOOP;
    IF abs(v_split_total - COALESCE(v_order.total, 0)) > 0.01 THEN
      RAISE EXCEPTION 'SPLIT_AMOUNT_MISMATCH' USING ERRCODE = 'P0001',
        HINT = format('مجموع الدفعات (%s) لا يطابق إجمالي الفاتورة (%s)', v_split_total, v_order.total); END IF;
  END IF;

  IF p_new_currency IS NOT NULL THEN
    IF p_new_method = 'mixed' THEN
      NULL;
    ELSE
      SELECT count(*) INTO v_pay_count FROM pos_payments WHERE order_id = p_order_id;
      IF v_pay_count > 1 THEN RAISE EXCEPTION 'MULTI_PAYMENT_CURRENCY_CHANGE_BLOCKED' USING ERRCODE = 'P0001',
        HINT = 'لا يمكن تغيير العملة على فاتورة فيها أكثر من دفعة'; END IF;
      IF p_new_method <> 'cash' THEN RAISE EXCEPTION 'CURRENCY_REQUIRES_CASH' USING ERRCODE = 'P0001',
        HINT = 'تغيير العملة مسموح فقط مع الدفع النقدي'; END IF;
      IF upper(p_new_currency) <> 'ILS' AND (p_new_exchange_rate IS NULL OR p_new_exchange_rate <= 0) THEN
        RAISE EXCEPTION 'INVALID_EXCHANGE_RATE' USING ERRCODE = 'P0001'; END IF;
      IF NOT EXISTS (SELECT 1 FROM currencies WHERE user_id = v_company_id AND upper(code) = upper(p_new_currency))
         AND upper(p_new_currency) <> 'ILS' THEN
        RAISE EXCEPTION 'UNKNOWN_CURRENCY' USING ERRCODE = 'P0001'; END IF;
    END IF;
  END IF;

  SELECT string_agg(DISTINCT payment_method, ','), min(currency), min(exchange_rate), sum(amount)
    INTO v_old_methods, v_old_currency, v_old_rate, v_old_amount
    FROM pos_payments WHERE order_id = p_order_id;

  v_new_amount := COALESCE(v_order.total, v_old_amount);

  IF v_order.payment_method = 'employee_account' AND v_order.employee_id IS NOT NULL THEN
    SELECT jsonb_agg(row_to_json(m)::jsonb) INTO v_old_emp_movements
      FROM public.employee_financial_movements m
     WHERE m.reference_type = 'pos_order' AND m.reference_id = p_order_id::text;

    WITH del AS (
      DELETE FROM public.employee_financial_movements
       WHERE reference_type = 'pos_order' AND reference_id = p_order_id::text
       RETURNING 1
    ) SELECT count(*) INTO v_movements_revrs FROM del;
  END IF;

  DELETE FROM pos_payments WHERE order_id = p_order_id;

  IF p_new_method = 'mixed' THEN
    FOR v_split_row IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
      INSERT INTO pos_payments(order_id, payment_method, amount, currency, exchange_rate, foreign_amount, user_id, created_at, change_amount, change_currency)
      VALUES (
        p_order_id,
        v_split_row->>'method',
        (v_split_row->>'amount')::numeric,
        upper(COALESCE(v_split_row->>'currency','ILS')),
        COALESCE((v_split_row->>'exchange_rate')::numeric, 1),
        COALESCE((v_split_row->>'foreign_amount')::numeric, (v_split_row->>'amount')::numeric),
        v_company_id, now(),
        COALESCE((v_split_row->>'change_amount')::numeric, 0),
        upper(COALESCE(v_split_row->>'change_currency', v_split_row->>'currency','ILS'))
      );
    END LOOP;
  ELSE
    INSERT INTO pos_payments(order_id, payment_method, amount, currency, exchange_rate, foreign_amount, user_id, created_at)
    VALUES (
      p_order_id, p_new_method, v_new_amount,
      upper(COALESCE(p_new_currency, v_old_currency, 'ILS')),
      COALESCE(p_new_exchange_rate, v_old_rate, 1),
      CASE
        WHEN p_new_currency IS NULL OR upper(p_new_currency) = 'ILS' THEN v_new_amount
        ELSE v_new_amount / COALESCE(p_new_exchange_rate, 1)
      END,
      v_company_id, now()
    );
  END IF;

  UPDATE pos_orders
     SET payment_method   = p_new_method,
         currency         = upper(COALESCE(p_new_currency, v_order.currency, 'ILS')),
         exchange_rate    = COALESCE(p_new_exchange_rate, v_order.exchange_rate, 1),
         foreign_currency = CASE
             WHEN upper(COALESCE(p_new_currency, v_order.currency, 'ILS')) = 'ILS' THEN NULL
             ELSE upper(COALESCE(p_new_currency, v_order.currency))
           END,
         employee_id      = CASE WHEN p_new_method = 'employee_account' THEN p_employee_id ELSE NULL END,
         gl_updated_at    = now()
   WHERE id = p_order_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- ============================================================
  -- GL SYNC: fix journal_entry_lines to reflect the new tender
  -- ============================================================
  DECLARE
    v_je_id uuid;
    v_customer_id uuid;
    v_customer_name text;
    v_new_debit_account text;
    v_je_currency text;
    v_je_rate numeric;
    v_je_foreign numeric;
    v_je_amount numeric;
    v_tender jsonb;
    v_new_debit text;
    v_line_local numeric;
    v_line_native numeric;
    v_line_rate2 numeric;
    v_line_currency2 text;
    v_visa_acct text;
    v_target_debit_accounts text[];
  BEGIN
    SELECT je.id INTO v_je_id
      FROM public.journal_entries je
     WHERE je.reference_type = 'pos_order'
       AND je.reference_id = p_order_id::text
       AND COALESCE(je.status,'posted') = 'posted'
     ORDER BY je.created_at DESC LIMIT 1;

    IF v_je_id IS NOT NULL THEN
      v_customer_id := v_order.pos_customer_id;
      IF v_customer_id IS NULL THEN
        SELECT c.id INTO v_customer_id
          FROM public.contacts c
         WHERE c.user_id = v_company_id
           AND c.contact_type = 'customer'
           AND (c.contact_name = COALESCE(v_order.customer_name, '__none__')
                OR c.tax_number = v_order.customer_tax_number)
         LIMIT 1;
      END IF;

      SELECT contact_name INTO v_customer_name FROM public.contacts WHERE id = v_customer_id;

      -- Determine which debit accounts to remove (old asset/receivable side)
      v_target_debit_accounts := ARRAY[
        '1110','1112','1120','1130','1131','1132','1133','1134','1135','1150','1160'
      ];
      SELECT array_agg(DISTINCT jel.account_code) INTO v_target_debit_accounts
        FROM public.journal_entry_lines jel
       WHERE jel.journal_entry_id = v_je_id
         AND jel.debit > 0
         AND (jel.account_code LIKE '11%' OR jel.account_code = '2180' OR jel.account_code LIKE '213%');

      DELETE FROM public.journal_entry_lines
       WHERE journal_entry_id = v_je_id
         AND debit > 0
         AND account_code = ANY(v_target_debit_accounts);
      GET DIAGNOSTICS v_gl_rows_deleted = ROW_COUNT;

      IF p_new_method <> 'mixed' THEN
        v_je_currency := upper(COALESCE(p_new_currency, v_order.currency, 'ILS'));
        v_je_rate     := COALESCE(p_new_exchange_rate, v_order.exchange_rate, 1);
        v_je_amount   := v_new_amount;
        v_je_foreign  := CASE WHEN v_je_currency = 'ILS' THEN v_je_amount ELSE v_je_amount / v_je_rate END;

        IF p_new_method = 'cash' THEN
          v_new_debit_account := CASE
            WHEN v_je_currency = 'USD' THEN '1112'
            WHEN v_je_currency = 'JOD' THEN '1113'
            WHEN v_je_currency = 'EUR' THEN '1114'
            ELSE '1110'
          END;
        ELSIF p_new_method = 'card' THEN
          v_new_debit_account := COALESCE(p_visa_gl_account_code, '1120');
        ELSIF p_new_method = 'credit' THEN
        v_new_debit_account := NULL;
        IF v_customer_id IS NOT NULL THEN
          SELECT NULLIF(BTRIM(linked_account_code),'') INTO v_new_debit_account
            FROM public.contacts WHERE id = v_customer_id AND user_id = v_company_id LIMIT 1;
        END IF;
        v_new_debit_account := COALESCE(v_new_debit_account, '1130');
        ELSIF p_new_method = 'employee_account' THEN
          SELECT COALESCE(linked_account_code, '2180') INTO v_new_debit_account
            FROM public.contacts WHERE user_id = v_company_id AND linked_employee_id = p_employee_id LIMIT 1;
          v_new_debit_account := COALESCE(v_new_debit_account, '2180');
        END IF;

        INSERT INTO public.journal_entry_lines(
          journal_entry_id, account_code, account_name, description,
          debit, credit, foreign_debit, foreign_credit, currency, exchange_rate,
          contact_id, user_id, created_at, updated_at
        ) VALUES (
          v_je_id, v_new_debit_account,
          (SELECT account_name FROM public.accounts WHERE user_id = v_company_id AND account_code = v_new_debit_account LIMIT 1),
          format('POS %s — %s', v_order.receipt_number, p_new_method),
          v_je_amount, 0,
          v_je_foreign, 0,
          v_je_currency, v_je_rate,
          CASE WHEN p_new_method IN ('credit','employee_account') THEN v_customer_id ELSE NULL END,
          v_company_id, now(), now()
        );
        v_gl_rows_inserted := 1;

      ELSE
        -- mixed: insert one debit line per split
        FOR v_tender IN SELECT * FROM jsonb_array_elements(p_split_payments) LOOP
          v_line_local    := (v_tender->>'amount')::numeric;
          v_line_currency2 := upper(COALESCE(v_tender->>'currency','ILS'));
          v_line_rate2    := COALESCE((v_tender->>'exchange_rate')::numeric, 1);
          v_line_native   := COALESCE((v_tender->>'foreign_amount')::numeric, v_line_local);

          IF (v_tender->>'method') = 'cash' THEN
            v_new_debit := CASE
              WHEN v_line_currency2 = 'USD' THEN '1112'
              WHEN v_line_currency2 = 'JOD' THEN '1113'
              WHEN v_line_currency2 = 'EUR' THEN '1114'
              ELSE '1110'
            END;
          ELSIF (v_tender->>'method') = 'card' THEN
            v_visa_acct := COALESCE(v_tender->>'visa_gl_account_code', p_visa_gl_account_code, '1120');
            v_new_debit := v_visa_acct;
          ELSIF (v_tender->>'method') = 'credit' THEN
          v_new_debit := NULL;
          IF v_customer_id IS NOT NULL THEN
            SELECT NULLIF(BTRIM(linked_account_code),'') INTO v_new_debit
              FROM public.contacts WHERE id = v_customer_id AND user_id = v_company_id LIMIT 1;
          END IF;
          v_new_debit := COALESCE(v_new_debit, '1130');
          END IF;

          INSERT INTO public.journal_entry_lines(
            journal_entry_id, account_code, account_name, description,
            debit, credit, foreign_debit, foreign_credit, currency, exchange_rate,
            contact_id, user_id, created_at, updated_at
          ) VALUES (
            v_je_id, v_new_debit,
            (SELECT account_name FROM public.accounts WHERE user_id = v_company_id AND account_code = v_new_debit LIMIT 1),
            format('POS %s — %s (mixed)', v_order.receipt_number, v_tender->>'method'),
            v_line_local, 0,
            v_line_native, 0,
            v_line_currency2, v_line_rate2,
            CASE WHEN (v_tender->>'method') = 'credit' THEN v_customer_id ELSE NULL END,
            v_company_id, now(), now()
          );
          v_gl_rows_inserted := v_gl_rows_inserted + 1;
        END LOOP;
      END IF;
    END IF;
  END;

  IF p_new_method = 'employee_account' THEN
    SELECT COALESCE(meal_discount_percent, 0) INTO v_meal_pct
      FROM employees WHERE id = p_employee_id AND user_id = v_company_id;
    v_meal_full := COALESCE(v_order.total, 0);
    v_meal_deducted := ROUND(v_meal_full * (1 - COALESCE(v_meal_pct,0) / 100.0), 2);

    INSERT INTO public.employee_financial_movements(
      employee_id, user_id, movement_type, amount, description,
      reference_type, reference_id, movement_date, meta
    ) VALUES (
      p_employee_id, v_company_id, 'meal_deduction', v_meal_deducted,
      format('POS %s — %s', v_order.receipt_number, v_emp_name),
      'pos_order', p_order_id::text, CURRENT_DATE,
      jsonb_build_object('meal_full', v_meal_full, 'meal_pct', v_meal_pct, 'meal_deducted', v_meal_deducted,
                         'changed_from', v_order.payment_method, 'changed_at', now())
    );
  END IF;

  INSERT INTO public.pos_shift_post_close_edits(
    session_id, order_id, edit_kind, before_snapshot, after_snapshot, edited_by, edited_by_pos_user_id, manager_user_id, reason, created_at
  ) VALUES (
    v_order.session_id, p_order_id, 'payment_method_change',
    jsonb_build_object('methods', v_old_methods, 'currency', v_old_currency, 'rate', v_old_rate, 'amount', v_old_amount,
                       'employee_movements_reversed', v_old_emp_movements),
    jsonb_build_object('method', p_new_method, 'currency', p_new_currency, 'rate', p_new_exchange_rate, 'employee_id', p_employee_id, 'splits', p_split_payments),
    auth.uid(), p_pos_user_id, p_manager_user_id, p_edit_reason, now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'employee_movements_reversed', v_movements_revrs,
    'gl_rows_deleted', v_gl_rows_deleted,
    'gl_rows_inserted', v_gl_rows_inserted,
    'gl_scope', 'pos_order_id');
END;
$function$;