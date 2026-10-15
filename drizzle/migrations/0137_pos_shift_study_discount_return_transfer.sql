ALTER TABLE public.accountant_permissions
  ADD COLUMN IF NOT EXISTS can_pos_shift_discount boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pos_shift_return boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pos_shift_transfer boolean NOT NULL DEFAULT false;

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
    'cancel_cash_out', v_admin OR COALESCE(ap.can_pos_shift_cancel_cash_out,false),
    'discount_order', v_admin OR COALESCE(ap.can_pos_shift_discount,false),
    'return_order', v_admin OR COALESCE(ap.can_pos_shift_return,false),
    'transfer_cash', v_admin OR COALESCE(ap.can_pos_shift_transfer,false));
END $$;

-- Allow pos_return_v2 on a closed shift only when called through the audited correction wrapper.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.pos_return_v2(uuid,uuid,jsonb,text,text,text,numeric)'::regprocedure);
  n := replace(d, 'IF v_session.closed_at IS NOT NULL OR COALESCE(v_session.state,''opened'') NOT IN (''opened'',''open'') THEN',
                  'IF (v_session.closed_at IS NOT NULL OR COALESCE(v_session.state,''opened'') NOT IN (''opened'',''open'')) AND COALESCE(current_setting(''app.pos_shift_correction'', true), '''') <> ''on'' THEN');
  IF n = d THEN RAISE EXCEPTION 'patch pos_return_v2 failed'; END IF;
  EXECUTE n;
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_return_v1(p_original_order_id uuid, p_items jsonb, p_reason text, p_payment_method text DEFAULT 'cash', p_return_currency text DEFAULT 'ILS', p_return_exchange_rate numeric DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record; r jsonb;
BEGIN
  SELECT id, session_id INTO o FROM public.pos_orders WHERE id = p_original_order_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(o.session_id, 'return_order', p_reason);
  PERFORM set_config('app.pos_shift_correction', 'on', true);
  r := public.pos_return_v2(p_original_order_id, o.session_id, p_items, '[تصحيح دراسة الوردية] ' || btrim(p_reason),
         p_payment_method, p_return_currency, p_return_exchange_rate);
  PERFORM set_config('app.pos_shift_correction', 'off', true);
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (o.session_id, 'pos_orders', o.id, 'order_return', jsonb_build_object('items', p_items, 'method', p_payment_method), r, btrim(p_reason), auth.uid());
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_discount_order_v1(p_order_id uuid, p_discount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record; d numeric; v_n int; pay record; v_before jsonb; v_date date; r jsonb;
BEGIN
  SELECT * INTO o FROM public.pos_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(o.session_id, 'discount_order', p_reason);
  IF o.state <> 'paid' THEN RAISE EXCEPTION 'الخصم مسموح على فاتورة مدفوعة فقط'; END IF;
  IF COALESCE(o.is_return,false) THEN RAISE EXCEPTION 'لا يمكن الخصم على فاتورة مرتجع'; END IF;
  IF EXISTS (SELECT 1 FROM public.pos_orders x WHERE x.original_order_id = o.id AND COALESCE(x.is_return,false) AND x.state = 'paid') THEN
    RAISE EXCEPTION 'الفاتورة عليها مرتجع — لا يمكن تعديل الخصم بعده';
  END IF;
  d := round(COALESCE(p_discount,0), 2);
  IF d <= 0 THEN RAISE EXCEPTION 'قيمة الخصم يجب أن تكون أكبر من صفر'; END IF;
  IF d >= COALESCE(o.total,0) THEN RAISE EXCEPTION 'الخصم أكبر من أو يساوي قيمة الفاتورة'; END IF;

  SELECT count(*) INTO v_n FROM public.pos_payments WHERE order_id = o.id AND COALESCE(is_refund,false) = false;
  IF v_n = 1 THEN
    SELECT * INTO pay FROM public.pos_payments WHERE order_id = o.id AND COALESCE(is_refund,false) = false FOR UPDATE;
  ELSE
    SELECT * INTO pay FROM public.pos_payments
     WHERE order_id = o.id AND COALESCE(is_refund,false) = false AND COALESCE(payment_method,'cash') = 'cash'
       AND COALESCE(currency,'ILS') = 'ILS' AND amount >= d
     ORDER BY amount DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF pay.id IS NULL THEN RAISE EXCEPTION 'الفاتورة مقسّمة ولا يوجد جزء كاش بالشيكل يغطي الخصم'; END IF;
  IF COALESCE(pay.currency,'ILS') <> 'ILS' THEN RAISE EXCEPTION 'الخصم مدعوم على دفعات الشيكل فقط'; END IF;
  IF pay.amount < d THEN RAISE EXCEPTION 'الخصم أكبر من مبلغ الدفعة'; END IF;

  SELECT jsonb_build_object('total', o.total, 'discount_amount', o.discount_amount,
           'payments', COALESCE((SELECT jsonb_agg(to_jsonb(pp)) FROM public.pos_payments pp WHERE pp.order_id = o.id), '[]'::jsonb))
    INTO v_before;
  SELECT transaction_date INTO v_date FROM public.transactions
   WHERE pos_order_id = o.id AND transaction_type = 'pos_sale' AND COALESCE(is_deleted,false) = false
   ORDER BY created_at LIMIT 1;

  PERFORM set_config('app.pos_shift_correction', 'on', true);
  UPDATE public.pos_orders SET discount_amount = COALESCE(discount_amount,0) + d, total = total - d WHERE id = o.id;
  UPDATE public.pos_payments
     SET amount = amount - d,
         change_amount = CASE WHEN tendered IS NOT NULL THEN COALESCE(change_amount,0) + d ELSE change_amount END,
         notes = btrim(COALESCE(notes,'') || ' [خصم دراسة الوردية ' || d || ']')
   WHERE id = pay.id;
  r := public.repost_pos_order_gl(o.id, false, 'pos_shift_discount: ' || btrim(p_reason));
  PERFORM set_config('app.pos_shift_correction', 'off', true);
  IF NOT COALESCE((r->>'success')::boolean,false) THEN RAISE EXCEPTION 'تعذّر إعادة ترحيل القيد: %', COALESCE(r->>'error',''); END IF;
  IF v_date IS NOT NULL THEN
    UPDATE public.transactions SET transaction_date = v_date
     WHERE id = ANY (ARRAY(SELECT jsonb_array_elements_text(r->'new_tx_ids'))::uuid[]);
  END IF;

  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (o.session_id, 'pos_orders', o.id, 'order_discount', v_before,
          jsonb_build_object('discount', d, 'new_total', o.total - d, 'payment_id', pay.id, 'repost', r), btrim(p_reason), auth.uid());
  RETURN jsonb_build_object('success', true, 'discount', d, 'new_total', o.total - d);
END $$;

CREATE OR REPLACE FUNCTION public.pos_shift_transfer_cash_v1(p_session_id uuid, p_to_box_id uuid, p_amount numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; fb record; tb record; v_amt numeric; v_done numeric; v_n int; r jsonb; v_ref text; v_reason text;
BEGIN
  v_reason := COALESCE(NULLIF(btrim(p_reason),''), 'ترحيل كاش الوردية');
  SELECT * INTO s FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  PERFORM public._pos_shift_correction_gate(s.id, 'transfer_cash', v_reason);
  IF s.cash_box_id IS NULL THEN RAISE EXCEPTION 'الوردية غير مرتبطة بصندوق'; END IF;
  SELECT * INTO fb FROM public.cash_boxes WHERE id = s.cash_box_id;
  SELECT * INTO tb FROM public.cash_boxes WHERE id = p_to_box_id AND user_id = s.user_id;
  IF tb.id IS NULL THEN RAISE EXCEPTION 'الصندوق الهدف غير موجود'; END IF;
  IF tb.id = fb.id THEN RAISE EXCEPTION 'لا يمكن الترحيل لنفس صندوق الوردية'; END IF;
  IF COALESCE(fb.gl_account_code,'') = '' OR COALESCE(tb.gl_account_code,'') = '' THEN RAISE EXCEPTION 'أحد الصناديق بلا حساب محاسبي'; END IF;
  v_amt := round(COALESCE(p_amount,0), 2);
  IF v_amt <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;
  SELECT COALESCE(sum(amount_ils),0), count(*) INTO v_done, v_n FROM public.cash_transfers
   WHERE pos_session_id = s.id AND from_box_id = s.cash_box_id;
  IF v_amt > COALESCE(s.closing_cash,0) - v_done + 0.01 THEN
    RAISE EXCEPTION 'المبلغ أكبر من كاش الوردية المتبقي (%)', round(COALESCE(s.closing_cash,0) - v_done, 2);
  END IF;
  r := public.create_cash_transfer_atomic(s.user_id, fb.gl_account_code, tb.gl_account_code, v_amt, 'شيكل',
         COALESCE(s.business_date, s.closed_at::date, CURRENT_DATE),
         'ترحيل كاش وردية ' || COALESCE(s.shift_code, '') || ' ' || COALESCE(s.cashier_name,'') || ' إلى ' || COALESCE(tb.name,'') || ' — ' || v_reason,
         'POS-SHIFT-TRF-' || s.id::text || '-' || (v_n + 1), 'pos_shift', fb.id, tb.id);
  IF NOT COALESCE((r->>'success')::boolean,false) THEN RAISE EXCEPTION '%', COALESCE(r->>'error','تعذّر الترحيل'); END IF;
  IF COALESCE((r->>'duplicate')::boolean,false) THEN RAISE EXCEPTION 'تم تنفيذ هذا الترحيل مسبقاً'; END IF;
  v_ref := 'TRF-SH-' || s.id::text || '-' || (v_n + 1);
  UPDATE public.transactions SET reference = v_ref WHERE id = (r->>'transaction_id')::uuid;
  UPDATE public.cash_transfers SET pos_session_id = s.id, created_by = auth.uid() WHERE id = (r->>'cash_transfer_id')::uuid;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (s.id, 'cash_transfers', (r->>'cash_transfer_id')::uuid, 'cash_transfer', NULL,
          r || jsonb_build_object('to_box', tb.name, 'amount', v_amt, 'reference', v_ref), v_reason, auth.uid());
  RETURN r || jsonb_build_object('reference', v_ref);
END $$;

REVOKE ALL ON FUNCTION public.pos_shift_return_v1(uuid,jsonb,text,text,text,numeric) FROM public, anon;
REVOKE ALL ON FUNCTION public.pos_shift_discount_order_v1(uuid,numeric,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.pos_shift_transfer_cash_v1(uuid,uuid,numeric,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_return_v1(uuid,jsonb,text,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_shift_discount_order_v1(uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_shift_transfer_cash_v1(uuid,uuid,numeric,text) TO authenticated;