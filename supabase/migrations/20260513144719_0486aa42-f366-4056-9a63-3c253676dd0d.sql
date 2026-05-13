-- ============================================================
-- Cancel Cheque Deposit (إلغاء إيداع شيك وارد)
-- Mirrors cancel_cheque_endorsement: reverse entry + status restore + guard
-- ============================================================

-- 1) Extend the validation trigger to also gate "مودع → مسجل"
CREATE OR REPLACE FUNCTION public.validate_cheque_endorsement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unendorse_flag text;
  v_undeposit_flag text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('مسجل', 'آجل') THEN
      RAISE EXCEPTION 'الشيك الجديد يجب أن يكون بحالة "مسجل" أو "آجل" فقط (الحالة الحالية: %)', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'مظهر' AND OLD.status <> 'مظهر' THEN
      IF OLD.status NOT IN ('مسجل', 'آجل', 'مستحق') THEN
        RAISE EXCEPTION 'لا يمكن تظهير شيك بحالة % — يجب أن يكون "مسجل" أو "آجل" أو "مستحق"', OLD.status;
      END IF;
      IF NEW.endorsed_to_contact_id IS NULL AND (NEW.endorsed_to_name IS NULL OR NEW.endorsed_to_name = '') THEN
        RAISE EXCEPTION 'تظهير الشيك يتطلب جهة تظهير (contact أو اسم)';
      END IF;
    END IF;

    -- Unendorse path (مظهر → مسجل) must use official RPC
    IF OLD.status = 'مظهر' AND NEW.status = 'مسجل' THEN
      v_unendorse_flag := current_setting('app.cheque_unendorse', true);
      IF v_unendorse_flag IS NULL OR v_unendorse_flag <> 'true' THEN
        RAISE EXCEPTION 'إلغاء التجيير يجب أن يتم عبر زر "إلغاء التجيير" الرسمي فقط (ليس تعديلاً مباشراً)';
      END IF;
    END IF;

    -- NEW: Undeposit path (مودع → مسجل) must use official RPC
    IF OLD.status = 'مودع' AND NEW.status = 'مسجل' THEN
      v_undeposit_flag := current_setting('app.cheque_undeposit', true);
      IF v_undeposit_flag IS NULL OR v_undeposit_flag <> 'true' THEN
        RAISE EXCEPTION 'إلغاء الإيداع يجب أن يتم عبر زر "إلغاء الإيداع" الرسمي فقط (ليس تعديلاً مباشراً)';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Official cancel-deposit RPC
CREATE OR REPLACE FUNCTION public.cancel_cheque_deposit(
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
  v_deposit_tx RECORD;
  v_reverse_tx_id uuid;
  v_subsequent_count int;
BEGIN
  IF p_user_id IS NULL OR p_cheque_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'المعاملات الأساسية مفقودة');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'سبب إلغاء الإيداع مطلوب (3 أحرف على الأقل)');
  END IF;

  SELECT * INTO v_cheque
  FROM public.cheques
  WHERE id = p_cheque_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الشيك غير موجود');
  END IF;

  IF v_cheque.status <> 'مودع' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء الإيداع: حالة الشيك "' || v_cheque.status || '". يجب أن تكون "مودع".');
  END IF;

  -- Subsequent activity guard: no collect/bounce/cashed/return after the deposit
  SELECT count(*) INTO v_subsequent_count
  FROM public.cheque_status_history
  WHERE cheque_id = p_cheque_id
    AND action_type IN ('collect','bounce','cashed','pay_outbound','return_to_customer','cancel','cancel_with_reverse','endorse')
    AND created_at > COALESCE(
      (SELECT max(created_at) FROM public.cheque_status_history
       WHERE cheque_id = p_cheque_id AND action_type = 'deposit'),
      v_cheque.created_at);
  IF v_subsequent_count > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', 'لا يمكن إلغاء الإيداع لوجود حركة لاحقة على الشيك (تحصيل/ارتداد/تظهير). تراجع عنها أولاً.');
  END IF;

  -- Find the last non-reversed deposit transaction
  SELECT t.* INTO v_deposit_tx
  FROM public.transactions t
  JOIN public.cheque_status_history h ON h.linked_transaction_id = t.id
  WHERE h.cheque_id = p_cheque_id AND h.action_type = 'deposit'
    AND t.is_deleted = false
    AND NOT EXISTS (SELECT 1 FROM public.transactions r WHERE r.reversed_by_id = t.id)
  ORDER BY t.created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على قيد الإيداع الأصلي أو أنه عُكس مسبقاً.');
  END IF;

  v_reverse_tx_id := public.create_reverse_entry(
    v_deposit_tx.id,
    'إلغاء إيداع شيك #' || COALESCE(v_cheque.cheque_number, '') || ' — السبب: ' || p_reason,
    p_user_id);

  -- Restore status and clear deposit fields under the official guard flag
  PERFORM set_config('app.cheque_undeposit', 'true', true);
  UPDATE public.cheques
  SET status = 'مسجل'::cheque_status,
      deposit_bank_account_id = NULL,
      deposit_date = NULL,
      deposit_cash_box_id = NULL,
      updated_at = now()
  WHERE id = p_cheque_id;
  PERFORM set_config('app.cheque_undeposit', 'false', true);

  BEGIN
    INSERT INTO public.cheque_status_history(cheque_id, user_id, from_status, to_status, action_type, reason, linked_transaction_id, details)
    VALUES (p_cheque_id, p_user_id, 'مودع'::cheque_status, 'مسجل'::cheque_status, 'undeposit', p_reason, v_reverse_tx_id,
      jsonb_build_object('original_deposit_tx_id', v_deposit_tx.id,
                        'reverse_tx_id', v_reverse_tx_id,
                        'previous_bank_account_id', v_cheque.deposit_bank_account_id,
                        'previous_deposit_date', v_cheque.deposit_date,
                        'event_date', CURRENT_DATE));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'cheque_id', p_cheque_id,
    'new_status', 'مسجل',
    'original_tx_id', v_deposit_tx.id, 'reverse_tx_id', v_reverse_tx_id);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.cheque_undeposit', 'false', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;