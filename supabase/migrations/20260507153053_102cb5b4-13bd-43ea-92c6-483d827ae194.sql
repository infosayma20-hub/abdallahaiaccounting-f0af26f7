CREATE OR REPLACE FUNCTION public.unendorse_cheque(
  p_cheque_id uuid,
  p_user_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cheque public.cheques%ROWTYPE;
  v_endorse_tx public.transactions%ROWTYPE;
  v_reverse_tx_id uuid;
  v_subsequent_count int;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'سبب إلغاء التجيير مطلوب (3 أحرف على الأقل)');
  END IF;

  SELECT * INTO v_cheque FROM public.cheques WHERE id = p_cheque_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الشيك غير موجود');
  END IF;

  IF v_cheque.status::text <> 'مظهر' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء التجيير: حالة الشيك الحالية "' || v_cheque.status || '". يجب أن تكون "مظهر".');
  END IF;

  SELECT count(*) INTO v_subsequent_count
  FROM public.cheque_status_history
  WHERE cheque_id = p_cheque_id
    AND action_type IN ('collect','return','cancel','bounce')
    AND created_at > COALESCE(v_cheque.endorsed_at, v_cheque.created_at);
  IF v_subsequent_count > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء التجيير: يوجد حركات لاحقة على الشيك (تحصيل/إرجاع/إلغاء). يجب التراجع عنها أولاً.');
  END IF;

  SELECT * INTO v_endorse_tx
  FROM public.transactions
  WHERE user_id = p_user_id
    AND is_deleted = false
    AND reverse_of_transaction_id IS NULL
    AND id NOT IN (SELECT reverse_of_transaction_id FROM public.transactions WHERE reverse_of_transaction_id IS NOT NULL AND user_id = p_user_id)
    AND (
      (v_cheque.endorsement_voucher_id IS NOT NULL AND id = v_cheque.endorsement_voucher_id)
      OR (description ILIKE '%تجيير%' AND description ILIKE '%' || COALESCE(v_cheque.cheque_number,'') || '%')
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لم يتم العثور على قيد التجيير الأصلي أو أنه عُكس مسبقاً.');
  END IF;

  v_reverse_tx_id := public.create_reverse_entry(
    v_endorse_tx.id,
    'إلغاء تجيير شيك #' || COALESCE(v_cheque.cheque_number, '') || ' — السبب: ' || p_reason,
    p_user_id
  );

  PERFORM set_config('app.cheque_unendorse', 'true', true);

  UPDATE public.cheques
  SET status = 'مسجل'::cheque_status,
      endorsed_to_contact_id = NULL,
      endorsed_to_name = NULL,
      endorsed_at = NULL,
      endorsement_voucher_id = NULL,
      endorsement_notes = NULL,
      contact_id = (
        SELECT c.id FROM public.contacts c
        WHERE c.user_id = p_user_id AND c.contact_name = v_cheque.party_name
        LIMIT 1
      ),
      updated_at = now()
  WHERE id = p_cheque_id;

  PERFORM set_config('app.cheque_unendorse', 'false', true);

  BEGIN
    INSERT INTO public.cheque_status_history(
      cheque_id, user_id, from_status, to_status,
      action_type, reason, linked_transaction_id, details
    )
    VALUES (
      p_cheque_id, p_user_id,
      'مظهر'::cheque_status, 'مسجل'::cheque_status,
      'unendorse', p_reason, v_reverse_tx_id,
      jsonb_build_object(
        'original_endorsement_tx_id', v_endorse_tx.id,
        'reverse_tx_id', v_reverse_tx_id,
        'previous_endorsed_to', v_cheque.endorsed_to_name,
        'previous_endorsed_to_contact_id', v_cheque.endorsed_to_contact_id,
        'event_date', CURRENT_DATE
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'cheque_id', p_cheque_id,
    'new_status', 'مسجل',
    'original_tx_id', v_endorse_tx.id,
    'reverse_tx_id', v_reverse_tx_id
  );
END;
$$;