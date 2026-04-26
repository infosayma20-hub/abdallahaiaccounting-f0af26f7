-- 1) Cancel reasons table
CREATE TABLE IF NOT EXISTS public.pos_cancel_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason_text text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_cancel_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view cancel reasons"
  ON public.pos_cancel_reasons FOR SELECT
  USING (is_team_member(auth.uid(), user_id) AND user_can_access(auth.uid(), 'pos'));

CREATE POLICY "Team can insert cancel reasons"
  ON public.pos_cancel_reasons FOR INSERT
  WITH CHECK (is_team_member(auth.uid(), user_id) AND user_can_access(auth.uid(), 'pos'));

CREATE POLICY "Team can update cancel reasons"
  ON public.pos_cancel_reasons FOR UPDATE
  USING (is_team_member(auth.uid(), user_id) AND user_can_access(auth.uid(), 'pos'));

CREATE POLICY "Team can delete non-system cancel reasons"
  ON public.pos_cancel_reasons FOR DELETE
  USING (is_team_member(auth.uid(), user_id) AND user_can_access(auth.uid(), 'pos') AND is_system = false);

-- Seed default reasons for existing users
INSERT INTO public.pos_cancel_reasons (user_id, reason_text, display_order, is_system)
SELECT DISTINCT cs.user_id, r.reason_text, r.display_order, true
FROM public.company_settings cs
CROSS JOIN (VALUES
  ('خطأ إدخال', 1),
  ('الزبون غيّر رأيه', 2),
  ('تأخير في المطبخ', 3),
  ('خطأ تسعير', 4),
  ('مشكلة جودة', 5),
  ('أخرى', 99)
) AS r(reason_text, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pos_cancel_reasons pcr WHERE pcr.user_id = cs.user_id
);

-- 2) void_pos_order function
CREATE OR REPLACE FUNCTION public.void_pos_order(
  p_order_id uuid,
  p_session_id uuid,
  p_reason text,
  p_cancelled_by_name text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_session IS NULL OR v_session.status != 'open' THEN
    RETURN jsonb_build_object('success', false, 'error', 'الوردية مغلقة — استخدم مردود مبيعات بدلاً من الإلغاء');
  END IF;

  IF v_order.session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'لا يمكن إلغاء طلب من وردية أخرى — استخدم مردود مبيعات'
    );
  END IF;

  -- If paid, create reverse accounting entry
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
$$;

GRANT EXECUTE ON FUNCTION public.void_pos_order(uuid, uuid, text, text, uuid) TO authenticated;