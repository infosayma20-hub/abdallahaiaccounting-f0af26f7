CREATE OR REPLACE FUNCTION public.pos_update_expense_v1(p_expense_id uuid, p_amount numeric, p_description text, p_account_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record; v_uid uuid := auth.uid(); v_status text; v_acc_ok boolean;
BEGIN
  SELECT * INTO e FROM public.pos_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المصروف غير موجود'; END IF;
  IF NOT (public.is_team_member(v_uid, e.user_id)
          AND (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'accountant_senior')))
     AND NOT public.has_role(v_uid,'super_admin') THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل المصروفات';
  END IF;
  IF COALESCE(e.expense_kind,'account') <> 'account' THEN
    RAISE EXCEPTION 'السلف والقروض تُعدّل من شاشة الموارد البشرية';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;
  SELECT status INTO v_status FROM public.pos_shift_audits WHERE session_id = e.shift_id;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'الوردية معتمدة من التدقيق — لا يمكن التعديل'; END IF;
  IF NULLIF(p_account_code,'') IS NOT NULL AND p_account_code <> COALESCE(e.account_code,'') THEN
    SELECT EXISTS(SELECT 1 FROM public.accounts a WHERE a.user_id = e.user_id AND a.account_code = p_account_code
      AND COALESCE(a.is_active, true)
      AND NOT EXISTS (SELECT 1 FROM public.accounts c WHERE c.user_id = e.user_id AND c.parent_code = a.account_code)) INTO v_acc_ok;
    IF NOT v_acc_ok THEN RAISE EXCEPTION 'رقم الحساب غير موجود أو حساب رئيسي'; END IF;
  END IF;

  IF e.transaction_id IS NOT NULL THEN
    UPDATE public.transactions SET amount = p_amount,
      description = COALESCE(NULLIF(p_description,''), description),
      debit_account_code = COALESCE(NULLIF(p_account_code,''), debit_account_code)
    WHERE id = e.transaction_id;
  END IF;
  UPDATE public.pos_expenses SET amount = p_amount,
    description = COALESCE(NULLIF(p_description,''), description),
    account_code = COALESCE(NULLIF(p_account_code,''), account_code)
  WHERE id = p_expense_id;

  INSERT INTO public.activity_log(user_id, actor_id, action, entity_type, entity_id, entity_label, details)
  VALUES (e.user_id, v_uid, 'update', 'pos_expense', e.id::text, COALESCE(NULLIF(p_description,''), e.description),
    jsonb_build_object('before', jsonb_build_object('amount', e.amount, 'description', e.description, 'account_code', e.account_code),
                       'after', jsonb_build_object('amount', p_amount, 'description', p_description, 'account_code', p_account_code),
                       'shift_id', e.shift_id, 'transaction_id', e.transaction_id));
  RETURN jsonb_build_object('ok', true);
END $$;