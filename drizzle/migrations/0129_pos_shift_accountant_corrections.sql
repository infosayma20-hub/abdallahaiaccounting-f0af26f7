ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS pos_shift_corrections_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.accountant_permissions
  ADD COLUMN IF NOT EXISTS can_pos_shift_change_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pos_shift_split_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pos_shift_void_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pos_shift_cancel_cash_out boolean NOT NULL DEFAULT false;
ALTER TABLE public.pos_purchases
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS reversal_transaction_id uuid;

-- Internal bypass flag: set only by the pos_shift_* correction RPCs below (transaction-local).
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.pos_guard_session_open()'::regprocedure);
  n := regexp_replace(d, E'\nBEGIN\n', E'\nBEGIN\n  IF COALESCE(current_setting(''app.pos_shift_correction'', true), '''') = ''on'' THEN RETURN NEW; END IF;\n');
  IF n = d THEN RAISE EXCEPTION 'patch pos_guard_session_open failed'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.guard_pos_payment_method_change()'::regprocedure);
  n := regexp_replace(d, E'\nBEGIN\n', E'\nBEGIN\n  IF COALESCE(current_setting(''app.pos_shift_correction'', true), '''') = ''on'' THEN RETURN NEW; END IF;\n');
  IF n = d THEN RAISE EXCEPTION 'patch guard_pos_payment_method_change failed'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.change_pos_payment_method(uuid,text,text,uuid,uuid,integer,text,numeric,uuid,jsonb,text)'::regprocedure);
  n := replace(d, 'IF NOT FOUND OR v_session.state <> ''open'' THEN',
                  'IF NOT FOUND OR (v_session.state <> ''open'' AND COALESCE(current_setting(''app.pos_shift_correction'', true), '''') <> ''on'') THEN');
  IF n = d THEN RAISE EXCEPTION 'patch change_pos_payment_method failed'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.void_pos_order(uuid,uuid,text,text,uuid)'::regprocedure);
  n := replace(d, 'IF v_session IS NULL OR v_session.state != ''open'' THEN',
                  'IF v_session IS NULL OR (v_session.state != ''open'' AND COALESCE(current_setting(''app.pos_shift_correction'', true), '''') <> ''on'') THEN');
  IF n = d THEN RAISE EXCEPTION 'patch void_pos_order failed'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.get_pos_shift_reconciliation(uuid)'::regprocedure);
  n := replace(d, 'AND COALESCE(payment_type, ''cash'') = ''cash''',
                  'AND COALESCE(payment_type, ''cash'') = ''cash'' AND cancelled_at IS NULL');
  IF n = d THEN RAISE EXCEPTION 'patch get_pos_shift_reconciliation failed'; END IF;
  EXECUTE n;
END $$;

-- Access summary (never raises) used by the shift study screen.
CREATE OR REPLACE FUNCTION public.pos_shift_correction_access(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); s record; v_enabled boolean; v_admin boolean; ap record; v_status text; v_lock text;
BEGIN
  SELECT id, user_id, state, COALESCE(is_deleted,false) is_deleted INTO s FROM public.pos_sessions WHERE id = p_session_id;
  IF s.id IS NULL OR v_uid IS NULL THEN RETURN jsonb_build_object('enabled', false); END IF;
  SELECT COALESCE(pos_shift_corrections_enabled,false) INTO v_enabled FROM public.company_settings WHERE user_id = s.user_id LIMIT 1;
  IF NOT COALESCE(v_enabled,false) THEN RETURN jsonb_build_object('enabled', false); END IF;
  v_admin := (public.is_team_member(v_uid, s.user_id) AND public.has_role(v_uid,'admin')) OR v_uid = s.user_id;
  SELECT * INTO ap FROM public.accountant_permissions
   WHERE accountant_auth_id = v_uid AND user_id = s.user_id AND is_active AND COALESCE(can_audit_pos_shifts,false) LIMIT 1;
  SELECT status INTO v_status FROM public.pos_shift_audits WHERE session_id = p_session_id;
  v_lock := CASE WHEN s.state = 'open' THEN 'الوردية لسا مفتوحة'
                 WHEN s.is_deleted THEN 'الوردية محذوفة'
                 WHEN v_status = 'approved' THEN 'تدقيق الوردية معتمد — التعديل مقفل'
                 ELSE NULL END;
  RETURN jsonb_build_object(
    'enabled', true,
    'locked_reason', v_lock,
    'change_payment', v_admin OR COALESCE(ap.can_pos_shift_change_payment,false),
    'split_payment', v_admin OR COALESCE(ap.can_pos_shift_split_payment,false),
    'void_order', v_admin OR COALESCE(ap.can_pos_shift_void_order,false),
    'cancel_cash_out', v_admin OR COALESCE(ap.can_pos_shift_cancel_cash_out,false));
END $$;

CREATE OR REPLACE FUNCTION public._pos_shift_correction_gate(p_session_id uuid, p_perm text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a jsonb;
BEGIN
  IF length(btrim(COALESCE(p_reason,''))) < 3 THEN RAISE EXCEPTION 'السبب إلزامي (3 أحرف على الأقل)'; END IF;
  IF p_session_id IS NULL THEN RAISE EXCEPTION 'العملية غير مرتبطة بوردية'; END IF;
  a := public.pos_shift_correction_access(p_session_id);
  IF NOT COALESCE((a->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'تصحيحات الوردية غير مفعّلة لهذه الشركة'; END IF;
  IF a->>'locked_reason' IS NOT NULL THEN RAISE EXCEPTION '%', a->>'locked_reason'; END IF;
  IF NOT COALESCE((a->>p_perm)::boolean,false) THEN RAISE EXCEPTION 'ليس لديك صلاحية هذا الإجراء'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_correct_payment_v1(p_order_id uuid, p_new_method text, p_visa_gl_account_code text, p_split_payments jsonb, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record; r jsonb;
BEGIN
  SELECT id, session_id, user_id INTO o FROM public.pos_orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF p_new_method NOT IN ('cash','card','credit','mixed') THEN RAISE EXCEPTION 'طريقة دفع غير مدعومة'; END IF;
  PERFORM public._pos_shift_correction_gate(o.session_id, CASE WHEN p_new_method = 'mixed' THEN 'split_payment' ELSE 'change_payment' END, p_reason);
  PERFORM set_config('app.pos_shift_correction', 'on', true);
  r := public.change_pos_payment_method(p_order_id, p_new_method, '[تصحيح دراسة الوردية] ' || btrim(p_reason),
         NULL, auth.uid(), 30, NULL, NULL, NULL,
         CASE WHEN p_new_method = 'mixed' THEN p_split_payments ELSE NULL END,
         NULLIF(btrim(COALESCE(p_visa_gl_account_code,'')),''));
  PERFORM set_config('app.pos_shift_correction', 'off', true);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_void_order_v1(p_order_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record; r jsonb; v_name text; v_before jsonb;
BEGIN
  SELECT * INTO o FROM public.pos_orders WHERE id = p_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(o.session_id, 'void_order', p_reason);
  SELECT COALESCE(NULLIF(btrim(p.full_name),''), u.email) INTO v_name
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = auth.uid();
  SELECT jsonb_build_object('state', o.state, 'total', o.total,
           'payments', COALESCE((SELECT jsonb_agg(to_jsonb(pp)) FROM public.pos_payments pp WHERE pp.order_id = o.id), '[]'::jsonb))
    INTO v_before;
  PERFORM set_config('app.pos_shift_correction', 'on', true);
  r := public.void_pos_order(p_order_id, o.session_id, '[تصحيح دراسة الوردية] ' || btrim(p_reason), COALESCE(v_name,'محاسب'), o.user_id);
  PERFORM set_config('app.pos_shift_correction', 'off', true);
  IF NOT COALESCE((r->>'success')::boolean,false) THEN RAISE EXCEPTION '%', COALESCE(r->>'error','تعذّر الإلغاء'); END IF;
  IF jsonb_array_length(COALESCE(r->'reverse_errors','[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'تعذّر عكس بعض القيود: %', r->'reverse_errors';
  END IF;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (o.session_id, 'pos_orders', o.id, 'order_void', v_before, r, btrim(p_reason), auth.uid());
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_cancel_purchase_v1(p_purchase_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pu record; v_tx uuid; v_cnt int; v_rev uuid; v_sm record;
BEGIN
  SELECT * INTO pu FROM public.pos_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF pu.id IS NULL THEN RAISE EXCEPTION 'المشتريات غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(pu.shift_id, 'cancel_cash_out', p_reason);
  IF pu.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'المشتريات ملغاة مسبقاً'; END IF;
  SELECT count(*), min(id::text)::uuid INTO v_cnt, v_tx FROM public.transactions t
   WHERE t.user_id = pu.user_id AND t.reference = 'PUR-POS-' || left(pu.id::text, 8)
     AND t.transaction_type IN ('purchase_cash','purchase_credit')
     AND COALESCE(t.is_deleted,false) = false
     AND t.contact_id IS NOT DISTINCT FROM pu.supplier_id
     AND abs(t.amount - pu.total_amount) < 0.01
     AND NOT EXISTS (SELECT 1 FROM public.transactions r WHERE r.reversed_by_id = t.id AND r.transaction_type = 'reversal' AND COALESCE(r.is_deleted,false) = false);
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'لم يُعثر على قيد واحد مطابق لهذه المشتريات (%) — لا يمكن الإلغاء من هنا', v_cnt; END IF;
  v_rev := public.create_reverse_entry(v_tx, 'إلغاء مشتريات نقطة البيع: ' || btrim(p_reason), auth.uid())::uuid;
  FOR v_sm IN SELECT * FROM public.stock_movements WHERE reference_type = 'pos_purchase_in' AND reference_id = pu.id LOOP
    INSERT INTO public.stock_movements (user_id, product_id, quantity, movement_type, reference_type, reference_id, reference_note, warehouse_id, unit_cost)
    VALUES (v_sm.user_id, v_sm.product_id, v_sm.quantity, 'صادر', 'pos_purchase_cancel', pu.id, 'إلغاء مشتريات الكاشير', v_sm.warehouse_id, v_sm.unit_cost);
  END LOOP;
  UPDATE public.pos_purchases SET cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason), reversal_transaction_id = v_rev WHERE id = pu.id;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (pu.shift_id, 'pos_purchases', pu.id, 'purchase_cancel', to_jsonb(pu), jsonb_build_object('reversal_transaction_id', v_rev, 'transaction_id', v_tx), btrim(p_reason), auth.uid());
  RETURN jsonb_build_object('ok', true, 'reversal_transaction_id', v_rev);
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_cancel_expense_v1(p_expense_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record; v_rev uuid;
BEGIN
  SELECT * INTO e FROM public.pos_expenses WHERE id = p_expense_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'المصروف غير موجود'; END IF;
  PERFORM public._pos_shift_correction_gate(e.shift_id, 'cancel_cash_out', p_reason);
  IF e.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'المصروف ملغى مسبقاً'; END IF;
  IF COALESCE(e.expense_kind,'account') <> 'account' THEN RAISE EXCEPTION 'السلف والقروض تُلغى من شاشة الموارد البشرية'; END IF;
  IF e.transaction_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.transaction_id AND COALESCE(t.is_deleted,false) = false) THEN
    RAISE EXCEPTION 'هذا المصروف غير مربوط بقيد محاسبي فعّال — لا يمكن إلغاؤه من هنا';
  END IF;
  v_rev := public.create_reverse_entry(e.transaction_id, 'إلغاء مصروف نقطة البيع: ' || btrim(p_reason), auth.uid())::uuid;
  UPDATE public.pos_expenses SET cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason), reversal_transaction_id = v_rev WHERE id = e.id;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (e.shift_id, 'pos_expenses', e.id, 'expense_cancel', to_jsonb(e), jsonb_build_object('reversal_transaction_id', v_rev), btrim(p_reason), auth.uid());
  RETURN jsonb_build_object('ok', true, 'reversal_transaction_id', v_rev);
END $$;

REVOKE ALL ON FUNCTION public._pos_shift_correction_gate(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_shift_correction_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_shift_correct_payment_v1(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_shift_void_order_v1(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_shift_cancel_purchase_v1(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_shift_cancel_expense_v1(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_correction_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_shift_correct_payment_v1(uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_shift_void_order_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_shift_cancel_purchase_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_shift_cancel_expense_v1(uuid,text) TO authenticated;