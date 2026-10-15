CREATE OR REPLACE FUNCTION public.pos_shift_close_cash_v1(
  p_session_id uuid, p_to_box_id uuid, p_actual_net numeric, p_expected_net numeric,
  p_employee_amount numeric DEFAULT 0, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; v_done numeric; v_actual numeric; v_expected numeric; v_var numeric; v_trf numeric;
  r_trf jsonb; r_set jsonb; v_reason text;
BEGIN
  v_reason := COALESCE(NULLIF(btrim(p_reason),''), 'ترحيل كاش الوردية مع تسوية الفرق');
  SELECT * INTO s FROM public.pos_sessions WHERE id = p_session_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  v_actual := round(COALESCE(p_actual_net,0), 2);
  v_expected := round(COALESCE(p_expected_net,0), 2);
  IF v_actual < 0 THEN RAISE EXCEPTION 'الكاش الفعلي غير صحيح'; END IF;
  SELECT COALESCE(sum(amount_ils),0) INTO v_done FROM public.cash_transfers
   WHERE pos_session_id = s.id AND from_box_id = s.cash_box_id;
  v_trf := round(v_actual - v_done, 2);
  v_var := round(v_actual - v_expected, 2);
  -- 1) transfer first (the correction gate refuses once the audit is approved)
  IF v_trf > 0 THEN
    r_trf := public.pos_shift_transfer_cash_v1(p_session_id, p_to_box_id, v_trf, v_reason);
  END IF;
  -- 2) settle the shortage/surplus in the same transaction
  IF abs(v_var) >= 0.01 THEN
    r_set := public.settle_pos_shift_variance_v1(p_session_id, v_var, COALESCE(p_employee_amount,0),
      v_reason || ' — فعلي معدود ' || v_actual || ' مقابل متوقع ' || v_expected);
  END IF;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (s.id, 'pos_sessions', s.id, 'cash_close', jsonb_build_object('closing_cash', s.closing_cash, 'opening_cash', s.opening_cash, 'already_transferred', v_done),
    jsonb_build_object('actual_net', v_actual, 'expected_net', v_expected, 'variance', v_var, 'transferred', GREATEST(v_trf,0), 'transfer', r_trf, 'settlement', r_set),
    v_reason, auth.uid());
  RETURN jsonb_build_object('success', true, 'transferred', GREATEST(v_trf,0), 'variance', v_var, 'transfer', r_trf, 'settlement', r_set);
END $$;
REVOKE ALL ON FUNCTION public.pos_shift_close_cash_v1(uuid,uuid,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_close_cash_v1(uuid,uuid,numeric,numeric,numeric,text) TO authenticated;