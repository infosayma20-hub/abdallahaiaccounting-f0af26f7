CREATE OR REPLACE FUNCTION public.void_pos_order(p_order_id uuid, p_session_id uuid, p_reason text, p_cancelled_by_name text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_session RECORD;
  v_reverse_tx_id uuid;
  v_was_paid boolean;
BEGIN
  SELECT * INTO v_order FROM public.pos_orders
  WHERE id = p_order_id AND user_id = p_user_id;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب غير موجود');
  END IF;

  IF v_order.state = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الطلب ملغى مسبقاً');
  END IF;

  IF v_order.is_return THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إلغاء فاتورة مرتجع');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'سبب الإلغاء مطلوب');
  END IF;

  v_was_paid := v_order.state = 'paid';

  -- Validate session: must belong to current open session
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session IS NULL OR v_session.state != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الوردية مغلقة — استخدم مردود مبيعات بدلاً من الإلغاء');
  END IF;

  IF v_order.session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'لا يمكن إلغاء طلب من وردية أخرى — استخدم مردود مبيعات'
    );
  END IF;

  IF v_was_paid AND v_order.transaction_id IS NOT NULL THEN
    BEGIN
      v_reverse_tx_id := public.create_reverse_entry(
        v_order.transaction_id,
        'إلغاء طلب POS #' || COALESCE(v_order.order_number, v_order.id::text) || ' — ' || p_reason,
        p_user_id
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'فشل إنشاء القيد العكسي: ' || SQLERRM);
    END;
  END IF;

  UPDATE public.pos_orders
  SET state = 'cancelled',
      cancel_reason = p_reason,
      cancelled_by = p_cancelled_by_name,
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'reverse_transaction_id', v_reverse_tx_id,
    'was_paid', v_was_paid
  );
END;
$function$;