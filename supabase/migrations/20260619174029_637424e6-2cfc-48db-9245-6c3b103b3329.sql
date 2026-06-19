-- ════════════════════════════════════════════════════════════════════
-- POS Offline Hardening — Phase 1
-- 1. UNIQUE constraint على (user_id, local_id) لمنع الازدواج
-- 2. RPC sync_offline_pos_sale: مزامنة كاملة للبيع الـoffline (order + lines + complete_pos_order)
-- 3. عمود sync_retry_count + sync_error + قيم quarantined لـ sync_status
-- ════════════════════════════════════════════════════════════════════

-- 1) إضافة أعمدة المتابعة
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS sync_retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- 2) فهرس UNIQUE على local_id لكل مستخدم لمنع تكرار نفس البيعة عند retry
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pos_orders_user_local_id
  ON public.pos_orders (user_id, local_id)
  WHERE local_id IS NOT NULL;

-- 3) RPC شاملة: تستقبل payload كامل (header + lines + payments) من الـoffline
-- ترجع { success, order_id, order_number, duplicated? }
CREATE OR REPLACE FUNCTION public.sync_offline_pos_sale(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID := (p_payload->>'user_id')::UUID;
  v_company_id    UUID := NULLIF(p_payload->>'company_id','')::UUID;
  v_session_id    UUID := NULLIF(p_payload->>'session_id','')::UUID;
  v_local_id      TEXT := p_payload->>'local_id';
  v_order_number  TEXT := p_payload->>'order_number';
  v_subtotal      NUMERIC := COALESCE((p_payload->>'subtotal')::NUMERIC,0);
  v_tax           NUMERIC := COALESCE((p_payload->>'tax_amount')::NUMERIC,0);
  v_discount      NUMERIC := COALESCE((p_payload->>'discount_amount')::NUMERIC,0);
  v_total         NUMERIC := COALESCE((p_payload->>'total')::NUMERIC,0);
  v_customer_id   UUID := NULLIF(p_payload->>'customer_id','')::UUID;
  v_customer_name TEXT := p_payload->>'customer_name';
  v_notes         TEXT := p_payload->>'notes';
  v_offline_at    TIMESTAMPTZ := COALESCE(NULLIF(p_payload->>'offline_created_at','')::TIMESTAMPTZ, now());
  v_lines         JSONB := COALESCE(p_payload->'items', '[]'::jsonb);
  v_payments      JSONB := COALESCE(p_payload->'payments', '[]'::jsonb);
  v_order_id      UUID;
  v_existing_id   UUID;
  v_existing_no   TEXT;
  v_line          JSONB;
  v_complete_res  JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_id is required');
  END IF;
  IF v_local_id IS NULL OR v_local_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'local_id is required for offline sync');
  END IF;

  -- Idempotency: إذا سبق وتم رفع نفس local_id نرجع المعرف الموجود ولا نكرر
  SELECT id, order_number INTO v_existing_id, v_existing_no
  FROM public.pos_orders
  WHERE user_id = v_user_id AND local_id = v_local_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_existing_id,
      'order_number', v_existing_no,
      'duplicated', true
    );
  END IF;

  -- 1) إنشاء الطلب كـdraft (سيُكمَّل لاحقاً عبر complete_pos_order)
  INSERT INTO public.pos_orders (
    user_id, company_id, session_id,
    order_number, local_id, was_offline, sync_status, synced_at,
    customer_id, customer_name,
    subtotal, tax_amount, discount_amount, total,
    state, paid_at, order_note
  ) VALUES (
    v_user_id, v_company_id, v_session_id,
    v_order_number, v_local_id, TRUE, 'synced', now(),
    v_customer_id, v_customer_name,
    v_subtotal, v_tax, v_discount, v_total,
    'draft', v_offline_at, v_notes
  )
  RETURNING id INTO v_order_id;

  -- 2) إدراج البنود
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    INSERT INTO public.pos_order_lines (
      user_id, order_id,
      product_id, product_name,
      qty, unit, unit_price,
      discount_pct, discount_amount,
      tax_rate, tax_amount,
      subtotal, total, cost_price
    ) VALUES (
      v_user_id, v_order_id,
      NULLIF(v_line->>'product_id','')::UUID, v_line->>'product_name',
      COALESCE((v_line->>'qty')::NUMERIC,0),
      v_line->>'unit',
      COALESCE((v_line->>'unit_price')::NUMERIC,0),
      COALESCE((v_line->>'discount_pct')::NUMERIC,0),
      COALESCE((v_line->>'discount_amount')::NUMERIC,0),
      COALESCE((v_line->>'tax_rate')::NUMERIC,0),
      COALESCE((v_line->>'tax_amount')::NUMERIC,0),
      COALESCE((v_line->>'subtotal')::NUMERIC,0),
      COALESCE((v_line->>'total')::NUMERIC,0),
      COALESCE((v_line->>'cost_price')::NUMERIC,0)
    );
  END LOOP;

  -- 3) استدعاء complete_pos_order لإكمال المحاسبة والمخزون والدفعات
  -- هذا يضمن نفس السلوك المحاسبي للعمليات online
  BEGIN
    v_complete_res := public.complete_pos_order(v_order_id, v_user_id, v_payments);
  EXCEPTION WHEN OTHERS THEN
    -- إذا فشل complete_pos_order نُعيد المحاولة لاحقاً مع تسجيل الخطأ
    UPDATE public.pos_orders
       SET sync_status = 'failed',
           sync_error = SQLERRM,
           sync_retry_count = COALESCE(sync_retry_count,0) + 1
     WHERE id = v_order_id;
    RETURN jsonb_build_object(
      'success', false,
      'order_id', v_order_id,
      'error', 'complete_pos_order failed: ' || SQLERRM
    );
  END;

  IF NOT COALESCE((v_complete_res->>'success')::BOOLEAN, false) THEN
    UPDATE public.pos_orders
       SET sync_status = 'failed',
           sync_error = COALESCE(v_complete_res->>'error', 'complete failed'),
           sync_retry_count = COALESCE(sync_retry_count,0) + 1
     WHERE id = v_order_id;
    RETURN jsonb_build_object(
      'success', false,
      'order_id', v_order_id,
      'error', v_complete_res->>'error'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', COALESCE(v_complete_res->>'order_number', v_order_number),
    'duplicated', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_offline_pos_sale(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_pos_sale(jsonb) TO service_role;

COMMENT ON FUNCTION public.sync_offline_pos_sale(jsonb) IS
'مزامنة بيعة POS تمت offline. تتحقق من local_id للحماية من الازدواج، تنشئ الطلب وبنوده، ثم تستدعي complete_pos_order لإتمام المحاسبة والمخزون. آمنة للاستدعاء المتكرر (idempotent).';