
-- 1. Enum for request status
DO $$ BEGIN
  CREATE TYPE public.rep_edit_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Requests table
CREATE TABLE IF NOT EXISTS public.rep_edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,                       -- company owner (data tenant)
  requested_by uuid NOT NULL,                  -- the rep user
  sales_rep_id uuid,                           -- contacts/sales_representatives id
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  proposed_items jsonb NOT NULL,               -- [{product_id, quantity, unit_price}, ...]
  original_snapshot jsonb,                     -- header + items at request time
  status public.rep_edit_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  new_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rep_edit_requests_invoice ON public.rep_edit_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rep_edit_requests_user_status ON public.rep_edit_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rep_edit_requests_requested_by ON public.rep_edit_requests(requested_by);

GRANT SELECT, INSERT, UPDATE ON public.rep_edit_requests TO authenticated;
GRANT ALL ON public.rep_edit_requests TO service_role;

ALTER TABLE public.rep_edit_requests ENABLE ROW LEVEL SECURITY;

-- Rep can view their own requests
CREATE POLICY "Rep can view own edit requests"
ON public.rep_edit_requests FOR SELECT TO authenticated
USING (requested_by = auth.uid());

-- Rep can insert requests for their own invoices
CREATE POLICY "Rep can create edit requests"
ON public.rep_edit_requests FOR INSERT TO authenticated
WITH CHECK (requested_by = auth.uid());

-- Company owner / admin can view all requests for their tenant
CREATE POLICY "Owner/admin can view tenant edit requests"
ON public.rep_edit_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

-- Only admin/owner can update (approve/reject through RPC; direct update guarded)
CREATE POLICY "Owner/admin can update edit requests"
ON public.rep_edit_requests FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. Audit table
CREATE TABLE IF NOT EXISTS public.rep_edit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  new_invoice_id uuid,
  edit_request_id uuid REFERENCES public.rep_edit_requests(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  edited_by uuid NOT NULL,
  reason text NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rep_edit_audit_invoice ON public.rep_edit_audit(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rep_edit_audit_user ON public.rep_edit_audit(user_id);

GRANT SELECT ON public.rep_edit_audit TO authenticated;
GRANT ALL ON public.rep_edit_audit TO service_role;

ALTER TABLE public.rep_edit_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/admin can view edit audit"
ON public.rep_edit_audit FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_rep_edit_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rep_edit_requests_updated_at ON public.rep_edit_requests;
CREATE TRIGGER trg_rep_edit_requests_updated_at
BEFORE UPDATE ON public.rep_edit_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_rep_edit_requests_updated_at();

-- 4. Helper: build a snapshot of an invoice (header + items + journal + stock)
CREATE OR REPLACE FUNCTION public.build_invoice_snapshot(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'invoice', to_jsonb(i.*),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(it.*) ORDER BY it.created_at)
      FROM public.invoice_items it WHERE it.invoice_id = i.id
    ), '[]'::jsonb),
    'transaction', (SELECT to_jsonb(t.*) FROM public.transactions t WHERE t.id = i.linked_transaction_id),
    'voucher_lines', COALESCE((
      SELECT jsonb_agg(to_jsonb(vl.*))
      FROM public.voucher_lines vl
      WHERE vl.transaction_id = i.linked_transaction_id
    ), '[]'::jsonb),
    'stock_movements', COALESCE((
      SELECT jsonb_agg(to_jsonb(sm.*))
      FROM public.stock_movements sm
      WHERE sm.reference_id = i.id OR sm.reference = i.invoice_number
    ), '[]'::jsonb)
  )
  INTO v
  FROM public.invoices i WHERE i.id = p_invoice_id;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.build_invoice_snapshot(uuid) TO authenticated;

-- 5. Request edit (called by rep)
CREATE OR REPLACE FUNCTION public.request_rep_invoice_edit(
  p_invoice_id uuid,
  p_reason text,
  p_proposed_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv RECORD;
  v_caller uuid := auth.uid();
  v_request_id uuid;
  v_existing uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'سبب التعديل مطلوب (3 حروف على الأقل)';
  END IF;

  IF p_proposed_items IS NULL OR jsonb_typeof(p_proposed_items) <> 'array' OR jsonb_array_length(p_proposed_items) = 0 THEN
    RAISE EXCEPTION 'البنود المقترحة مطلوبة';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;

  IF v_inv.source IS DISTINCT FROM 'rep' THEN
    RAISE EXCEPTION 'هذه الفاتورة ليست فاتورة مندوب';
  END IF;

  IF COALESCE(v_inv.is_voided, false) THEN
    RAISE EXCEPTION 'لا يمكن تعديل فاتورة ملغاة';
  END IF;

  IF v_inv.linked_transaction_id IS NULL THEN
    RAISE EXCEPTION 'الفاتورة غير مرحّلة بعد';
  END IF;

  -- Verify caller is the salesperson on this invoice (via sales_representatives.user_id)
  IF NOT EXISTS (
    SELECT 1 FROM public.sales_representatives sr
    WHERE sr.id = v_inv.salesperson_id AND sr.user_login_id = v_caller
  ) THEN
    RAISE EXCEPTION 'هذه ليست فاتورتك';
  END IF;

  -- Block if a pending request already exists
  SELECT id INTO v_existing FROM public.rep_edit_requests
  WHERE invoice_id = p_invoice_id AND status = 'pending' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'يوجد طلب تعديل قيد المراجعة لهذه الفاتورة';
  END IF;

  INSERT INTO public.rep_edit_requests (
    invoice_id, user_id, requested_by, sales_rep_id,
    reason, proposed_items, original_snapshot, status
  ) VALUES (
    p_invoice_id, v_inv.user_id, v_caller, v_inv.salesperson_id,
    trim(p_reason), p_proposed_items, public.build_invoice_snapshot(p_invoice_id), 'pending'
  )
  RETURNING id INTO v_request_id;

  -- Notify admin
  INSERT INTO public.admin_notifications (user_id, type, title, message, link, metadata)
  VALUES (
    v_inv.user_id,
    'rep_edit_request',
    'طلب تعديل فاتورة مندوب',
    'طلب تعديل على الفاتورة ' || v_inv.invoice_number,
    '/admin/rep-edit-requests',
    jsonb_build_object('invoice_id', p_invoice_id, 'request_id', v_request_id)
  );

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END $$;

GRANT EXECUTE ON FUNCTION public.request_rep_invoice_edit(uuid, text, jsonb) TO authenticated;

-- 6. Reject edit
CREATE OR REPLACE FUNCTION public.reject_rep_invoice_edit(
  p_request_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_req FROM public.rep_edit_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  IF v_req.user_id <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'صلاحية مرفوضة';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'الطلب ليس قيد المراجعة';
  END IF;

  UPDATE public.rep_edit_requests
  SET status = 'rejected', reviewed_by = v_caller, reviewed_at = now(),
      review_note = NULLIF(trim(COALESCE(p_note,'')), '')
  WHERE id = p_request_id;

  -- Notify rep
  INSERT INTO public.notification_log (user_id, type, title, message, metadata)
  VALUES (
    v_req.requested_by,
    'rep_edit_rejected',
    'تم رفض طلب التعديل',
    'تم رفض طلب تعديلك. ' || COALESCE('السبب: ' || p_note, ''),
    jsonb_build_object('invoice_id', v_req.invoice_id, 'request_id', p_request_id)
  );

  RETURN jsonb_build_object('success', true);
END $$;

GRANT EXECUTE ON FUNCTION public.reject_rep_invoice_edit(uuid, text) TO authenticated;

-- 7. Apply edit (admin) — void old + create new with same invoice_number
CREATE OR REPLACE FUNCTION public.apply_rep_invoice_edit(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_inv RECORD;
  v_caller uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_old_number text;
  v_void_res jsonb;
  v_create_res jsonb;
  v_new_invoice_id uuid;
  v_idem text;
  v_warehouse uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_req FROM public.rep_edit_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  IF v_req.user_id <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'صلاحية مرفوضة';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'الطلب ليس قيد المراجعة';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = v_req.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;

  IF COALESCE(v_inv.is_voided, false) THEN
    RAISE EXCEPTION 'الفاتورة ملغاة مسبقاً';
  END IF;

  v_old_number := v_inv.invoice_number;
  v_before := public.build_invoice_snapshot(v_inv.id);

  -- Step A: Void old invoice (creates reverse journal + restores stock)
  v_void_res := public.void_rep_sale_atomic(v_inv.id, 'تعديل بطلب المندوب: ' || v_req.reason);
  IF NOT COALESCE((v_void_res->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'فشل إلغاء الفاتورة الأصلية: %', v_void_res->>'error';
  END IF;

  -- Step B: Free up the old invoice_number by renaming voided record
  UPDATE public.invoices
  SET invoice_number = v_old_number || '-VOIDED-' || to_char(now(), 'YYYYMMDDHH24MISS')
  WHERE id = v_inv.id;

  -- Step C: Recreate with same original number
  v_warehouse := v_inv.warehouse_id;
  v_idem := 'rep-edit-' || p_request_id::text || '-' || extract(epoch from now())::text;

  v_create_res := public.create_rep_sale_atomic(
    p_user_id          => v_inv.user_id,
    p_sales_rep_id     => v_inv.salesperson_id,
    p_warehouse_id     => v_warehouse,
    p_contact_id       => v_inv.contact_id,
    p_contact_name     => COALESCE(v_inv.customer_name, ''),
    p_payment_method   => v_inv.payment_method,
    p_invoice_number   => v_old_number,
    p_idempotency_key  => v_idem,
    p_items            => v_req.proposed_items
  );

  IF NOT COALESCE((v_create_res->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'فشل إعادة إنشاء الفاتورة: %', v_create_res->>'error';
  END IF;

  v_new_invoice_id := NULLIF(v_create_res->>'invoice_id','')::uuid;

  -- Link old invoice to new one via notes
  UPDATE public.invoices
  SET notes = COALESCE(notes,'') || E'\n[تم استبدالها بعد التعديل بـ ' || v_old_number || ']'
  WHERE id = v_inv.id;

  -- Build after snapshot
  v_after := public.build_invoice_snapshot(v_new_invoice_id);

  -- Audit
  INSERT INTO public.rep_edit_audit (
    invoice_id, new_invoice_id, edit_request_id, user_id, edited_by,
    reason, before_snapshot, after_snapshot
  ) VALUES (
    v_inv.id, v_new_invoice_id, p_request_id, v_inv.user_id, v_caller,
    v_req.reason, v_before, v_after
  );

  -- Update request
  UPDATE public.rep_edit_requests
  SET status = 'approved', reviewed_by = v_caller, reviewed_at = now(),
      new_invoice_id = v_new_invoice_id
  WHERE id = p_request_id;

  -- Notify rep
  INSERT INTO public.notification_log (user_id, type, title, message, metadata)
  VALUES (
    v_req.requested_by,
    'rep_edit_approved',
    'تمت الموافقة على طلب التعديل',
    'تم تعديل الفاتورة ' || v_old_number || ' بنجاح',
    jsonb_build_object('invoice_id', v_inv.id, 'new_invoice_id', v_new_invoice_id, 'request_id', p_request_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_invoice_id', v_inv.id,
    'new_invoice_id', v_new_invoice_id,
    'invoice_number', v_old_number
  );
END $$;

GRANT EXECUTE ON FUNCTION public.apply_rep_invoice_edit(uuid) TO authenticated;
