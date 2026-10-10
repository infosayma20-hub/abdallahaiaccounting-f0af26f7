CREATE OR REPLACE FUNCTION public._ensure_named_leaf_account(p_owner uuid, p_parent_codes text[], p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_code text; v_parent record; v_n int;
BEGIN
  SELECT account_code INTO v_code FROM public.accounts
   WHERE user_id = p_owner AND COALESCE(is_active,true)
     AND regexp_replace(account_name,'\s+',' ','g') = p_name
     AND NOT EXISTS (SELECT 1 FROM public.accounts c WHERE c.user_id = p_owner AND c.parent_code = accounts.account_code)
   ORDER BY account_code LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  SELECT a.account_code, a.account_type INTO v_parent FROM public.accounts a
   WHERE a.user_id = p_owner AND a.account_code = ANY(p_parent_codes) AND COALESCE(a.is_active,true)
   ORDER BY array_position(p_parent_codes, a.account_code) LIMIT 1;
  IF v_parent.account_code IS NULL THEN
    RAISE EXCEPTION 'لا يوجد حساب رئيسي مناسب لإنشاء «%» (المطلوب أحد: %)', p_name, array_to_string(p_parent_codes, '، ');
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(substr(account_code, length(v_parent.account_code)+2), '\D','','g'),'')::int),0)+1
    INTO v_n FROM public.accounts
   WHERE user_id = p_owner AND parent_code = v_parent.account_code AND account_code LIKE v_parent.account_code || '-%';
  v_code := v_parent.account_code || '-' || lpad(v_n::text, 3, '0');
  INSERT INTO public.accounts(user_id, account_code, account_name, account_type, parent_code, is_active, notes)
  VALUES (p_owner, v_code, p_name, v_parent.account_type, v_parent.account_code, true, 'أُنشئ تلقائيًا لتسوية فروقات ورديات نقطة البيع');
  RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public._ensure_named_leaf_account(uuid,text[],text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_pos_shift_variance_v1(p_session_id uuid, p_variance numeric, p_employee_amount numeric, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); s record; a record;
  v_owner uuid; v_cash_gl text; v_abs numeric; v_emp numeric; v_rest numeric;
  v_emp_id uuid; v_emp_name text; v_emp_acc text; v_rev_acc text; v_exp_acc text;
  v_date date; v_ref text; v_tx uuid; v_res jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO s FROM public.pos_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  v_owner := s.user_id;
  IF NOT ((public.is_team_member(v_uid, v_owner) AND (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'accountant_senior')))
          OR public.has_role(v_uid,'super_admin')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تسوية فروقات الوردية';
  END IF;
  IF s.closed_at IS NULL THEN RAISE EXCEPTION 'الوردية ما زالت مفتوحة'; END IF;

  SELECT * INTO a FROM public.pos_shift_audits WHERE session_id = p_session_id FOR UPDATE;
  IF FOUND AND a.status = 'approved' THEN RAISE EXCEPTION 'فروقات هذه الوردية مسوّاة مسبقًا'; END IF;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE user_id = v_owner AND idempotency_key LIKE 'SHIFT-VAR-' || p_session_id::text || '%' AND COALESCE(is_deleted,false)=false) THEN
    RAISE EXCEPTION 'يوجد قيد تسوية سابق لهذه الوردية';
  END IF;

  v_abs := round(abs(COALESCE(p_variance,0)), 2);
  IF v_abs < 0.01 THEN RAISE EXCEPTION 'لا يوجد فرق لتسويته'; END IF;
  v_emp := round(COALESCE(p_employee_amount,0), 2);
  IF p_variance > 0 THEN v_emp := 0; END IF;
  IF v_emp < 0 OR v_emp > v_abs THEN RAISE EXCEPTION 'المبلغ على الموظف يجب أن يكون بين 0 و %', v_abs; END IF;
  v_rest := v_abs - v_emp;

  v_cash_gl := NULL;
  IF s.cash_box_id IS NOT NULL THEN SELECT gl_account_code INTO v_cash_gl FROM public.cash_boxes WHERE id = s.cash_box_id; END IF;
  IF v_cash_gl IS NULL AND s.terminal_id IS NOT NULL THEN SELECT cash_account_code INTO v_cash_gl FROM public.pos_terminals WHERE id = s.terminal_id; END IF;
  IF v_cash_gl IS NULL OR EXISTS (SELECT 1 FROM public.accounts c WHERE c.user_id = v_owner AND c.parent_code = v_cash_gl) THEN
    RAISE EXCEPTION 'لا يوجد صندوق فرعي مربوط بالوردية — اربط الصندوق بالجهاز أولًا';
  END IF;

  v_date := COALESCE((s.closed_at AT TIME ZONE 'Asia/Hebron')::date, current_date);
  v_ref := 'SHIFT-' || substr(p_session_id::text, 1, 8);

  IF p_variance > 0 THEN
    v_rev_acc := public._ensure_named_leaf_account(v_owner, ARRAY['4300','4900','4000'], 'إيراد فروقات صناديق');
    INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code,
      amount, currency, transaction_type, reference, payment_method, idempotency_key)
    VALUES (v_owner, v_date, 'فائض صندوق وردية - ' || COALESCE(s.cashier_name,''), v_cash_gl, v_rev_acc,
      v_abs, 'شيكل', 'cash_surplus', v_ref, 'نقدي', 'SHIFT-VAR-' || p_session_id::text || '-REV')
    RETURNING id INTO v_tx;
    v_res := jsonb_build_object('type','surplus','revenue_account',v_rev_acc,'amount',v_abs,'tx',v_tx);
  ELSE
    IF v_emp > 0 THEN
      v_emp_id := s.cashier_employee_id;
      IF v_emp_id IS NULL AND COALESCE(a.cashier_employee_id, NULL) IS NOT NULL THEN v_emp_id := a.cashier_employee_id; END IF;
      IF v_emp_id IS NULL THEN
        SELECT id INTO v_emp_id FROM public.employees
         WHERE user_id = v_owner AND auth_user_id = COALESCE(a.cashier_auth_user_id, s.cashier_auth_user_id) LIMIT 1;
      END IF;
      IF v_emp_id IS NULL THEN RAISE EXCEPTION 'الكاشير غير مربوط بموظف — لا يمكن تحميله العجز'; END IF;
      SELECT full_name INTO v_emp_name FROM public.employees WHERE id = v_emp_id;
      SELECT account_code INTO v_emp_acc FROM public.ensure_employee_sub_account(v_owner, v_emp_id);

      INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code,
        amount, currency, transaction_type, reference, payment_method, idempotency_key)
      VALUES (v_owner, v_date, 'عجز صندوق وردية على الموظف - ' || v_emp_name, v_emp_acc, v_cash_gl,
        v_emp, 'شيكل', 'cash_shortage', v_ref, 'نقدي', 'SHIFT-VAR-' || p_session_id::text || '-EMP')
      RETURNING id INTO v_tx;

      INSERT INTO public.employee_financial_movements(user_id, employee_id, source_type, source_id, source_reference,
        reference_number, category, description, amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes)
      VALUES (v_owner, v_emp_id, 'pos_shortage', v_tx, v_ref, v_ref, 'cash_shortage',
        'عجز صندوق - وردية ' || to_char(v_date,'YYYY-MM-DD'), v_emp, 'debit', 'approved', v_date,
        extract(month FROM v_date)::int, extract(year FROM v_date)::int, v_uid,
        'تسوية فروقات وردية من المحاسب. ' || COALESCE(p_notes,''));
      v_res := v_res || jsonb_build_object('employee_id', v_emp_id, 'employee_account', v_emp_acc, 'employee_amount', v_emp, 'employee_tx', v_tx);
    END IF;
    IF v_rest > 0 THEN
      v_exp_acc := public._ensure_named_leaf_account(v_owner, ARRAY['5900','5500','5000'], 'مصروف فروقات صناديق');
      INSERT INTO public.transactions(user_id, transaction_date, description, debit_account_code, credit_account_code,
        amount, currency, transaction_type, reference, payment_method, idempotency_key)
      VALUES (v_owner, v_date, 'عجز صندوق وردية تتحمله الشركة - ' || COALESCE(s.cashier_name,''), v_exp_acc, v_cash_gl,
        v_rest, 'شيكل', 'cash_shortage', v_ref, 'نقدي', 'SHIFT-VAR-' || p_session_id::text || '-EXP')
      RETURNING id INTO v_tx;
      v_res := v_res || jsonb_build_object('expense_account', v_exp_acc, 'company_amount', v_rest, 'expense_tx', v_tx);
    END IF;
    v_res := v_res || jsonb_build_object('type','shortage','amount',v_abs);
  END IF;

  v_res := v_res || jsonb_build_object('cash_account', v_cash_gl, 'variance', p_variance, 'notes', p_notes, 'settled_by', v_uid, 'settled_at', now());

  IF a.id IS NULL THEN
    INSERT INTO public.pos_shift_audits(user_id, session_id, terminal_id, cashier_name, cashier_auth_user_id, opened_at, closed_at,
      variance_total_ils, status, resolution_type, resolution_payload, accountant_notes, approved_by, approved_at)
    VALUES (v_owner, p_session_id, s.terminal_id, s.cashier_name, s.cashier_auth_user_id, s.opened_at, s.closed_at,
      p_variance, 'approved', 'variance_settlement', v_res, p_notes, v_uid, now());
  ELSE
    UPDATE public.pos_shift_audits SET status='approved', resolution_type='variance_settlement', resolution_payload=v_res,
      accountant_notes = COALESCE(p_notes, accountant_notes), approved_by=v_uid, approved_at=now()
    WHERE id = a.id;
  END IF;

  INSERT INTO public.activity_log(user_id, actor_id, action, entity_type, entity_id, entity_label, details)
  VALUES (v_owner, v_uid, 'settle', 'pos_shift_variance', p_session_id::text, COALESCE(s.cashier_name,''), v_res);
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.settle_pos_shift_variance_v1(uuid,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_pos_shift_variance_v1(uuid,numeric,numeric,text) TO authenticated;