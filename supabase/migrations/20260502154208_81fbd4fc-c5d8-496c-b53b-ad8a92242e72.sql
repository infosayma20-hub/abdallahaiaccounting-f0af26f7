-- ============================================================
-- إلغاء تجيير الشيك (Cancel Cheque Endorsement) — آمن مع Reverse Entry
-- ============================================================

-- 1) تعديل trigger التظهير للسماح بـ "مظهر" -> "مسجل" عند وجود علامة جلسة
CREATE OR REPLACE FUNCTION public.validate_cheque_endorsement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unendorse_flag text;
BEGIN
  -- INSERT: الشيك الجديد لازم يكون مسجل أو آجل
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('مسجل', 'آجل') THEN
      RAISE EXCEPTION 'الشيك الجديد يجب أن يكون بحالة "مسجل" أو "آجل" فقط (الحالة الحالية: %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: التحقق من تحولات الحالة
  IF TG_OP = 'UPDATE' THEN
    -- الانتقال إلى "مظهر": يتطلب جهة تظهير + الحالة السابقة بحوزتنا
    IF NEW.status = 'مظهر' AND OLD.status <> 'مظهر' THEN
      IF OLD.status NOT IN ('مسجل', 'آجل', 'مستحق') THEN
        RAISE EXCEPTION 'لا يمكن تظهير شيك بحالة % — يجب أن يكون "مسجل" أو "آجل" أو "مستحق"', OLD.status;
      END IF;
      IF NEW.endorsed_to_contact_id IS NULL AND (NEW.endorsed_to_name IS NULL OR NEW.endorsed_to_name = '') THEN
        RAISE EXCEPTION 'تظهير الشيك يتطلب جهة تظهير (contact أو اسم)';
      END IF;
    END IF;

    -- الانتقال من "مظهر" إلى "مسجل": مسموح فقط عبر دالة الإلغاء الرسمية
    IF OLD.status = 'مظهر' AND NEW.status = 'مسجل' THEN
      v_unendorse_flag := current_setting('app.cheque_unendorse', true);
      IF v_unendorse_flag IS NULL OR v_unendorse_flag <> 'true' THEN
        RAISE EXCEPTION 'إلغاء التجيير يجب أن يتم عبر زر "إلغاء التجيير" الرسمي فقط (ليس تعديلاً مباشراً)';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) دالة إلغاء التجيير الرسمية
CREATE OR REPLACE FUNCTION public.cancel_cheque_endorsement(
  p_user_id uuid,
  p_cheque_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cheque RECORD;
  v_endorse_tx RECORD;
  v_reverse_tx_id uuid;
  v_subsequent_count int;
BEGIN
  -- 1. التحقق من المدخلات
  IF p_user_id IS NULL OR p_cheque_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'المعاملات الأساسية مفقودة');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'سبب إلغاء التجيير مطلوب (3 أحرف على الأقل)');
  END IF;

  -- 2. جلب الشيك مع قفل
  SELECT * INTO v_cheque
  FROM public.cheques
  WHERE id = p_cheque_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الشيك غير موجود');
  END IF;

  -- 3. التحقق من الحالة
  IF v_cheque.status <> 'مظهر' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء التجيير: حالة الشيك الحالية "' || v_cheque.status || '". يجب أن تكون "مظهر".');
  END IF;

  -- 4. التحقق من عدم وجود حركات لاحقة (تحصيل/إرجاع/إلغاء بعد التجيير)
  SELECT count(*) INTO v_subsequent_count
  FROM public.cheque_status_history
  WHERE cheque_id = p_cheque_id
    AND action_type IN ('collect', 'bounce', 'return_to_customer', 'cancel', 'cancel_with_reverse', 'cashed', 'pay_outbound')
    AND created_at > COALESCE(
      (SELECT max(created_at) FROM public.cheque_status_history
       WHERE cheque_id = p_cheque_id AND action_type = 'endorse'),
      v_cheque.created_at
    );

  IF v_subsequent_count > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء التجيير: يوجد حركات لاحقة على الشيك (تحصيل/إرجاع/إلغاء). يجب التراجع عنها أولاً.');
  END IF;

  -- 5. جلب قيد التجيير الأصلي (آخر معاملة من نوع cheque_endorsement لهذا الشيك)
  SELECT t.* INTO v_endorse_tx
  FROM public.transactions t
  JOIN public.cheque_status_history h ON h.linked_transaction_id = t.id
  WHERE h.cheque_id = p_cheque_id
    AND h.action_type = 'endorse'
    AND t.is_deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions r WHERE r.reversed_by_id = t.id
    )
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لم يتم العثور على قيد التجيير الأصلي أو أنه عُكس مسبقاً.');
  END IF;

  -- 6. إنشاء القيد العكسي
  v_reverse_tx_id := public.create_reverse_entry(
    v_endorse_tx.id,
    'إلغاء تجيير شيك #' || COALESCE(v_cheque.cheque_number, '') ||
    ' — السبب: ' || p_reason,
    p_user_id
  );

  -- 7. إرجاع حالة الشيك إلى "مسجل" ومسح بيانات التجيير
  -- استخدام علامة جلسة للسماح بالـ trigger
  PERFORM set_config('app.cheque_unendorse', 'true', true);

  UPDATE public.cheques
  SET status = 'مسجل'::cheque_status,
      endorsed_to_contact_id = NULL,
      endorsed_to_name = NULL,
      endorsed_at = NULL,
      endorsement_voucher_id = NULL,
      endorsement_notes = NULL,
      contact_id = (
        -- إرجاع contact_id إلى الزبون الأصلي إن وجد عبر party_name
        SELECT c.id FROM public.contacts c
        WHERE c.user_id = p_user_id AND c.name = v_cheque.party_name
        LIMIT 1
      ),
      updated_at = now()
  WHERE id = p_cheque_id;

  PERFORM set_config('app.cheque_unendorse', 'false', true);

  -- 8. تسجيل الحدث في سجل الحالات
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

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_cheque_endorsement(uuid, uuid, text) TO authenticated;