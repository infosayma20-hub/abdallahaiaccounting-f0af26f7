
CREATE OR REPLACE FUNCTION public.void_pos_order(
  p_order_id uuid,
  p_session_id uuid,
  p_reason text,
  p_cancelled_by_name text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_session RECORD;
  v_tx RECORD;
  v_reverse_tx_id uuid;
  v_first_reverse_tx_id uuid;
  v_was_paid boolean;
  v_reversed_count int := 0;
  v_reverse_errors text[] := ARRAY[]::text[];
  v_efm_cancelled int := 0;
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

  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id;
  IF v_session IS NULL OR v_session.state != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الوردية مغلقة — استخدم مردود مبيعات بدلاً من الإلغاء');
  END IF;
  IF v_order.session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إلغاء طلب من وردية أخرى — استخدم مردود مبيعات');
  END IF;

  IF v_was_paid THEN
    FOR v_tx IN
      SELECT t.id, t.idempotency_key
      FROM public.transactions t
      WHERE t.pos_order_id = p_order_id
        AND t.user_id = p_user_id
        AND COALESCE(t.is_deleted, false) = false
        AND (t.idempotency_key IS NULL OR t.idempotency_key NOT LIKE 'REV-%')
        AND NOT EXISTS (
          SELECT 1 FROM public.transactions r
          WHERE r.user_id = p_user_id
            AND r.idempotency_key = 'REV-' || t.id::text
            AND COALESCE(r.is_deleted, false) = false
        )
      ORDER BY t.created_at
    LOOP
      BEGIN
        v_reverse_tx_id := public.create_reverse_entry(
          v_tx.id,
          'إلغاء طلب POS #' || COALESCE(v_order.order_number, v_order.id::text) || ' — ' || p_reason,
          p_user_id
        );
        v_reversed_count := v_reversed_count + 1;
        IF v_first_reverse_tx_id IS NULL THEN
          v_first_reverse_tx_id := v_reverse_tx_id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_reverse_errors := v_reverse_errors || (COALESCE(v_tx.idempotency_key, v_tx.id::text) || ': ' || SQLERRM);
      END;
    END LOOP;

    IF v_reversed_count = 0 AND v_order.transaction_id IS NOT NULL THEN
      BEGIN
        v_first_reverse_tx_id := public.create_reverse_entry(
          v_order.transaction_id,
          'إلغاء طلب POS #' || COALESCE(v_order.order_number, v_order.id::text) || ' — ' || p_reason,
          p_user_id
        );
        v_reversed_count := 1;
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'فشل إنشاء القيد العكسي: ' || SQLERRM);
      END;
    END IF;
  END IF;

  UPDATE public.employee_financial_movements
  SET status = 'rejected',
      notes  = COALESCE(notes, '') || ' | ملغى بسبب إلغاء الفاتورة: ' || p_reason,
      updated_at = now()
  WHERE user_id = p_user_id
    AND source_type = 'pos_meal'
    AND source_id = p_order_id
    AND status <> 'rejected';
  GET DIAGNOSTICS v_efm_cancelled = ROW_COUNT;

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
    'reverse_transaction_id', v_first_reverse_tx_id,
    'reversed_count', v_reversed_count,
    'reverse_errors', to_jsonb(v_reverse_errors),
    'employee_movements_cancelled', v_efm_cancelled,
    'was_paid', v_was_paid
  );
END;
$$;

-- Historical backfill
DO $backfill$
DECLARE
  v_order RECORD;
  v_tx RECORD;
BEGIN
  FOR v_order IN
    SELECT o.id, o.user_id, o.order_number, o.cancel_reason
    FROM public.pos_orders o
    WHERE o.state = 'cancelled'
      AND EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.pos_order_id = o.id
          AND t.user_id = o.user_id
          AND COALESCE(t.is_deleted, false) = false
          AND (t.idempotency_key IS NULL OR t.idempotency_key NOT LIKE 'REV-%')
          AND NOT EXISTS (
            SELECT 1 FROM public.transactions r
            WHERE r.user_id = o.user_id
              AND r.idempotency_key = 'REV-' || t.id::text
              AND COALESCE(r.is_deleted, false) = false
          )
      )
  LOOP
    FOR v_tx IN
      SELECT t.id, t.idempotency_key
      FROM public.transactions t
      WHERE t.pos_order_id = v_order.id
        AND t.user_id = v_order.user_id
        AND COALESCE(t.is_deleted, false) = false
        AND (t.idempotency_key IS NULL OR t.idempotency_key NOT LIKE 'REV-%')
        AND NOT EXISTS (
          SELECT 1 FROM public.transactions r
          WHERE r.user_id = v_order.user_id
            AND r.idempotency_key = 'REV-' || t.id::text
            AND COALESCE(r.is_deleted, false) = false
        )
    LOOP
      BEGIN
        PERFORM public.create_reverse_entry(
          v_tx.id,
          'إصلاح تلقائي: إكمال عكس قيود إلغاء POS #' || COALESCE(v_order.order_number, v_order.id::text)
            || ' — ' || COALESCE(v_order.cancel_reason, 'إلغاء سابق'),
          v_order.user_id
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Backfill skipped tx % for order %: %', v_tx.id, v_order.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  UPDATE public.employee_financial_movements efm
  SET status = 'rejected',
      notes  = COALESCE(efm.notes, '') || ' | إصلاح تلقائي — الفاتورة كانت ملغاة',
      updated_at = now()
  FROM public.pos_orders o
  WHERE efm.source_type = 'pos_meal'
    AND efm.source_id = o.id
    AND efm.user_id   = o.user_id
    AND o.state = 'cancelled'
    AND efm.status <> 'rejected';
END;
$backfill$;
