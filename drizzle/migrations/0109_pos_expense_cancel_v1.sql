ALTER TABLE public.pos_expenses
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS reversal_transaction_id uuid;

CREATE OR REPLACE FUNCTION public.pos_cancel_expense_v1(p_expense_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record; v_uid uuid := auth.uid(); v_status text; v_rev uuid; v_reason text := btrim(COALESCE(p_reason,''));
BEGIN
  SELECT * INTO e FROM public.pos_expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المصروف غير موجود'; END IF;
  IF NOT ((public.is_team_member(v_uid, e.user_id) AND public.has_role(v_uid,'admin'))
          OR public.has_role(v_uid,'super_admin')) THEN
    RAISE EXCEPTION 'إلغاء المصروف متاح للأدمن فقط';
  END IF;
  IF e.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'المصروف ملغى مسبقاً'; END IF;
  IF length(v_reason) < 3 THEN RAISE EXCEPTION 'سبب الإلغاء إلزامي'; END IF;
  IF COALESCE(e.expense_kind,'account') <> 'account' THEN
    RAISE EXCEPTION 'السلف والقروض تُلغى من شاشة الموارد البشرية';
  END IF;
  IF e.transaction_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = e.transaction_id AND COALESCE(t.is_deleted,false) = false) THEN
    RAISE EXCEPTION 'هذا المصروف غير مربوط بقيد محاسبي فعّال — لا يمكن إلغاؤه من هنا';
  END IF;
  SELECT status INTO v_status FROM public.pos_shift_audits WHERE session_id = e.shift_id;
  IF v_status = 'approved' THEN RAISE EXCEPTION 'الوردية معتمدة أو مسوّاة — لا يمكن الإلغاء'; END IF;

  v_rev := public.create_reverse_entry(e.transaction_id, 'إلغاء مصروف نقطة البيع: ' || v_reason, v_uid)::uuid;

  UPDATE public.pos_expenses SET cancelled_at = now(), cancelled_by = v_uid,
    cancel_reason = v_reason, reversal_transaction_id = v_rev
  WHERE id = p_expense_id;

  INSERT INTO public.activity_log(user_id, actor_id, action, entity_type, entity_id, entity_label, details)
  VALUES (e.user_id, v_uid, 'cancel', 'pos_expense', e.id::text, e.description,
    jsonb_build_object('amount', e.amount, 'account_code', e.account_code, 'reason', v_reason,
      'shift_id', e.shift_id, 'transaction_id', e.transaction_id, 'reversal_transaction_id', v_rev));
  RETURN jsonb_build_object('ok', true, 'reversal_transaction_id', v_rev);
END $$;
REVOKE ALL ON FUNCTION public.pos_cancel_expense_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_cancel_expense_v1(uuid, text) TO authenticated;

-- Edit must refuse cancelled expenses
CREATE OR REPLACE FUNCTION public.pos_expense_block_edit_cancelled()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.account_code IS DISTINCT FROM OLD.account_code
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'لا يمكن تعديل مصروف ملغى';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pos_expense_block_edit_cancelled ON public.pos_expenses;
CREATE TRIGGER trg_pos_expense_block_edit_cancelled BEFORE UPDATE ON public.pos_expenses
  FOR EACH ROW EXECUTE FUNCTION public.pos_expense_block_edit_cancelled();