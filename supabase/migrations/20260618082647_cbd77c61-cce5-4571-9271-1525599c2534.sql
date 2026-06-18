
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
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'سبب التعديل مطلوب (3 حروف على الأقل)';
  END IF;
  IF p_proposed_items IS NULL OR jsonb_typeof(p_proposed_items) <> 'array' OR jsonb_array_length(p_proposed_items) = 0 THEN
    RAISE EXCEPTION 'البنود المقترحة مطلوبة';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF v_inv.source IS DISTINCT FROM 'rep' THEN RAISE EXCEPTION 'هذه الفاتورة ليست فاتورة مندوب'; END IF;
  IF COALESCE(v_inv.is_voided, false) THEN RAISE EXCEPTION 'لا يمكن تعديل فاتورة ملغاة'; END IF;
  IF v_inv.linked_transaction_id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير مرحّلة بعد'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sales_representatives sr
    WHERE sr.id = v_inv.salesperson_id AND sr.auth_user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'هذه ليست فاتورتك';
  END IF;

  SELECT id INTO v_existing FROM public.rep_edit_requests
  WHERE invoice_id = p_invoice_id AND status = 'pending' LIMIT 1;
  IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'يوجد طلب تعديل قيد المراجعة لهذه الفاتورة'; END IF;

  INSERT INTO public.rep_edit_requests (
    invoice_id, user_id, requested_by, sales_rep_id,
    reason, proposed_items, original_snapshot, status
  ) VALUES (
    p_invoice_id, v_inv.user_id, v_caller, v_inv.salesperson_id,
    trim(p_reason), p_proposed_items, public.build_invoice_snapshot(p_invoice_id), 'pending'
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.admin_notifications (user_id, type, title, message, link, metadata)
  VALUES (
    v_inv.user_id, 'rep_edit_request', 'طلب تعديل فاتورة مندوب',
    'طلب تعديل على الفاتورة ' || v_inv.invoice_number,
    '/admin/rep-edit-requests',
    jsonb_build_object('invoice_id', p_invoice_id, 'request_id', v_request_id)
  );

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
END $$;

CREATE OR REPLACE FUNCTION public.apply_rep_invoice_edit(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD; v_inv RECORD;
  v_caller uuid := auth.uid();
  v_before jsonb; v_after jsonb;
  v_old_number text;
  v_void_res jsonb; v_create_res jsonb;
  v_new_invoice_id uuid; v_idem text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_req FROM public.rep_edit_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_req.user_id <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'صلاحية مرفوضة';
  END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'الطلب ليس قيد المراجعة'; END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = v_req.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF COALESCE(v_inv.is_voided, false) THEN RAISE EXCEPTION 'الفاتورة ملغاة مسبقاً'; END IF;

  v_old_number := v_inv.invoice_number;
  v_before := public.build_invoice_snapshot(v_inv.id);

  v_void_res := public.void_rep_sale_atomic(v_inv.id, 'تعديل بطلب المندوب: ' || v_req.reason);
  IF NOT COALESCE((v_void_res->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'فشل إلغاء الفاتورة الأصلية: %', v_void_res->>'error';
  END IF;

  UPDATE public.invoices
  SET invoice_number = v_old_number || '-VOIDED-' || to_char(now(), 'YYYYMMDDHH24MISS')
  WHERE id = v_inv.id;

  v_idem := 'rep-edit-' || p_request_id::text || '-' || extract(epoch from now())::text;

  v_create_res := public.create_rep_sale_atomic(
    p_user_id          => v_inv.user_id,
    p_sales_rep_id     => v_inv.salesperson_id,
    p_warehouse_id     => v_inv.warehouse_id,
    p_contact_id       => v_inv.contact_id,
    p_contact_name     => COALESCE(v_inv.contact_name, ''),
    p_payment_method   => v_inv.payment_method,
    p_invoice_number   => v_old_number,
    p_idempotency_key  => v_idem,
    p_items            => v_req.proposed_items
  );

  IF NOT COALESCE((v_create_res->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'فشل إعادة إنشاء الفاتورة: %', v_create_res->>'error';
  END IF;

  v_new_invoice_id := NULLIF(v_create_res->>'invoice_id','')::uuid;

  UPDATE public.invoices
  SET notes = COALESCE(notes,'') || E'\n[تم استبدالها بعد التعديل بـ ' || v_old_number || ']'
  WHERE id = v_inv.id;

  v_after := public.build_invoice_snapshot(v_new_invoice_id);

  INSERT INTO public.rep_edit_audit (
    invoice_id, new_invoice_id, edit_request_id, user_id, edited_by,
    reason, before_snapshot, after_snapshot
  ) VALUES (
    v_inv.id, v_new_invoice_id, p_request_id, v_inv.user_id, v_caller,
    v_req.reason, v_before, v_after
  );

  UPDATE public.rep_edit_requests
  SET status = 'approved', reviewed_by = v_caller, reviewed_at = now(),
      new_invoice_id = v_new_invoice_id
  WHERE id = p_request_id;

  INSERT INTO public.notification_log (user_id, type, title, message, metadata)
  VALUES (
    v_req.requested_by, 'rep_edit_approved', 'تمت الموافقة على طلب التعديل',
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
