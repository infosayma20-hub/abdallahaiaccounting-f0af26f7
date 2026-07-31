-- 1) فهرس تفرّد: قيد عكسي نشط واحد فقط لكل قيد أصلي
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_reversal_per_txn
  ON public.transactions (reversed_by_id)
  WHERE (transaction_type = 'reversal' AND COALESCE(is_deleted, false) = false AND reversed_by_id IS NOT NULL);

-- 2) create_reverse_entry: مفتاح تفرّد ثابت + معالجة التزامن
CREATE OR REPLACE FUNCTION public.create_reverse_entry(original_transaction_id uuid, reason text, reversed_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  orig public.transactions%ROWTYPE;
  new_id uuid;
BEGIN
  -- قفل صف القيد الأصلي لمنع محاولتَي عكس متزامنتين
  SELECT * INTO orig FROM public.transactions WHERE id = original_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القيد غير موجود';
  END IF;
  IF orig.is_deleted THEN
    RAISE EXCEPTION 'لا يمكن عكس قيد محذوف';
  END IF;

  -- منع العكس المزدوج
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE reversed_by_id = original_transaction_id
      AND transaction_type = 'reversal'
      AND COALESCE(is_deleted, false) = false
  ) THEN
    RAISE EXCEPTION 'هذا القيد عُكس مسبقاً';
  END IF;

  IF orig.debit_account_code IS NULL OR orig.credit_account_code IS NULL
     OR orig.amount IS NULL OR orig.amount = 0 THEN
    RAISE EXCEPTION 'القيد الأصلي ناقص: لا يمكن عمل mirror reverse';
  END IF;

  BEGIN
    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      account_id_debit, account_id_credit,
      amount, currency, transaction_type,
      reference, contact_id, payment_method,
      foreign_amount, exchange_rate,
      cost_center_name, workshop_id,
      reversed_by_id, notes, is_deleted, idempotency_key
    )
    VALUES (
      orig.user_id, CURRENT_DATE,
      'عكس قيد: ' || orig.description || ' — ' || reason,
      orig.credit_account_code, orig.debit_account_code,
      orig.account_id_credit,   orig.account_id_debit,
      orig.amount, orig.currency, 'reversal',
      'REV-' || COALESCE(orig.reference, orig.id::text),
      orig.contact_id, orig.payment_method,
      orig.foreign_amount, orig.exchange_rate,
      orig.cost_center_name, orig.workshop_id,
      original_transaction_id, reason, false,
      'REV-' || original_transaction_id::text
    )
    RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'هذا القيد عُكس مسبقاً';
  END;

  UPDATE public.transactions
     SET reversed_by_id = new_id
   WHERE id = original_transaction_id;

  RETURN new_id;
END;
$function$;

-- 3) void_pos_order: قفل على مستوى الطلب لمنع الإلغاء المزدوج المتزامن
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
  -- قفل ذري لكل طلب: يمنع تنفيذ إلغاءين متزامنين لنفس الفاتورة
  PERFORM pg_advisory_xact_lock(hashtextextended('void_pos_order:' || p_order_id::text, 0));

  SELECT * INTO v_order FROM public.pos_orders
  WHERE id = p_order_id AND user_id = p_user_id
  FOR UPDATE;

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
        AND t.transaction_type <> 'reversal'
        AND (t.idempotency_key IS NULL OR t.idempotency_key NOT LIKE 'REV-%')
        AND NOT EXISTS (
          SELECT 1 FROM public.transactions r
          WHERE r.reversed_by_id = t.id
            AND r.transaction_type = 'reversal'
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