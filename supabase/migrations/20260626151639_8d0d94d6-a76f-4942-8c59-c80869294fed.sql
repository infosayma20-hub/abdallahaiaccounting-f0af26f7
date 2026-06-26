
CREATE OR REPLACE FUNCTION public.pos_record_expense_v1(
  p_data_owner uuid,
  p_mode text,
  p_amount numeric,
  p_date date,
  p_description text,
  p_reference text,
  p_credit_account text,
  p_debit_account text,
  p_employee_id uuid,
  p_emp_kind text,
  p_installments int,
  p_start_month date,
  p_session_id uuid,
  p_manager_user_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_adv_id uuid;
  v_tx_type text;
  v_expense_kind text;
  v_inst_count int;
  v_inst_amt numeric;
  v_remaining numeric;
  v_i int;
  v_due date;
  v_a numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;
  IF p_data_owner IS NULL THEN
    RAISE EXCEPTION 'data owner required';
  END IF;

  IF p_mode = 'employee' THEN
    v_tx_type := 'employee_advance';
    v_expense_kind := CASE WHEN p_emp_kind = 'employee_loan' THEN 'employee_loan' ELSE 'employee_advance' END;
    v_inst_count := CASE WHEN p_emp_kind = 'employee_loan' THEN GREATEST(COALESCE(p_installments,1),1) ELSE 1 END;
    v_inst_amt := CASE WHEN v_inst_count > 0 THEN round(p_amount / v_inst_count, 2) ELSE p_amount END;

    INSERT INTO public.employee_advances (
      user_id, employee_id, advance_type, amount,
      request_date, approved_date, payment_date, payment_method,
      installments_count, installment_amount, start_deduction_month,
      status, approved_by, notes, created_by
    ) VALUES (
      p_data_owner, p_employee_id,
      CASE WHEN p_emp_kind = 'employee_loan' THEN 'قرض_حسن' ELSE 'سلفة_راتب' END,
      p_amount,
      p_date, p_date, p_date, 'نقداً',
      v_inst_count, v_inst_amt,
      COALESCE(p_start_month, (date_trunc('month', p_date) + INTERVAL '1 month')::date),
      'approved', p_manager_user_id, p_description, auth.uid()
    ) RETURNING id INTO v_adv_id;

    IF p_emp_kind = 'employee_loan' AND v_inst_count > 0 THEN
      v_remaining := p_amount;
      FOR v_i IN 1..v_inst_count LOOP
        v_due := (COALESCE(p_start_month, (date_trunc('month', p_date) + INTERVAL '1 month')::date)
                  + ((v_i - 1) || ' month')::interval)::date;
        IF v_i = v_inst_count THEN v_a := v_remaining; ELSE v_a := v_inst_amt; END IF;
        v_remaining := v_remaining - v_a;
        INSERT INTO public.employee_advance_installments
          (advance_id, employee_id, user_id, installment_number, due_month, amount, status)
        VALUES (v_adv_id, p_employee_id, p_data_owner, v_i, v_due, v_a, 'pending');
      END LOOP;
    END IF;
  ELSE
    v_tx_type := 'expense';
    v_expense_kind := 'account';
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code, amount, currency,
    transaction_type, reference, payment_method, idempotency_key
  ) VALUES (
    p_data_owner, p_date, p_description,
    p_debit_account, p_credit_account, p_amount, 'شيكل',
    v_tx_type, p_reference, 'نقدي', p_idempotency_key
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.pos_expenses (
    user_id, category_id, amount, description, shift_id, created_by,
    expense_kind, account_code, employee_id, advance_id, manager_user_id,
    transaction_id, payment_method
  ) VALUES (
    p_data_owner, NULL, p_amount, p_description, p_session_id, auth.uid(),
    v_expense_kind, p_debit_account,
    CASE WHEN p_mode = 'employee' THEN p_employee_id ELSE NULL END,
    v_adv_id, p_manager_user_id, v_tx_id, 'cash'
  );

  RETURN jsonb_build_object('transaction_id', v_tx_id, 'advance_id', v_adv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_record_expense_v1(uuid,text,numeric,date,text,text,text,text,uuid,text,int,date,uuid,uuid,text) TO authenticated, anon;
