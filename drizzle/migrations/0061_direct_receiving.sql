ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS can_direct_receive boolean NOT NULL DEFAULT false;

ALTER TABLE public.procurement_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS supplier_invoice_no text,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS submitted_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.procurement_order_items
  ADD COLUMN IF NOT EXISTS temp_barcode text,
  ADD COLUMN IF NOT EXISTS temp_photo_path text;
CREATE INDEX IF NOT EXISTS idx_po_direct_emp ON public.procurement_orders(submitted_by_employee_id) WHERE source = 'direct_receiving';

CREATE OR REPLACE FUNCTION public._direct_recv_employee()
RETURNS public.employees LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees;
BEGIN
  SELECT * INTO e FROM employees WHERE auth_user_id = auth.uid()
    AND can_direct_receive = true AND coalesce(is_active,true) = true AND coalesce(is_terminated,false) = false
  LIMIT 1;
  IF e.id IS NULL THEN RAISE EXCEPTION 'لا تملك صلاحية الاستلام المباشر'; END IF;
  RETURN e;
END $$;
REVOKE ALL ON FUNCTION public._direct_recv_employee() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._direct_recv_my_draft(p_order_id uuid)
RETURNS public.procurement_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees; o public.procurement_orders;
BEGIN
  e := _direct_recv_employee();
  SELECT * INTO o FROM procurement_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.source <> 'direct_receiving' OR o.submitted_by_employee_id IS DISTINCT FROM e.id THEN
    RAISE EXCEPTION 'الاستلام غير موجود';
  END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'تم إرسال هذا الاستلام للمحاسب ولا يمكن تعديله'; END IF;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public._direct_recv_my_draft(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._proc_item_for_product(p_product_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pr record; v_id uuid;
BEGIN
  SELECT * INTO pr FROM products WHERE id = p_product_id;
  IF pr.id IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM procurement_items WHERE inventory_product_id = p_product_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id INTO v_id FROM procurement_items WHERE user_id = pr.user_id AND name = pr.name AND inventory_product_id IS NULL LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE procurement_items SET inventory_product_id = p_product_id WHERE id = v_id; RETURN v_id;
  END IF;
  INSERT INTO procurement_items(user_id, name, unit, default_price, is_active, sort_order, inventory_product_id)
  VALUES (pr.user_id, pr.name, coalesce(nullif(pr.unit,''),'قطعة'), coalesce(pr.buy_price,0), true, 0, p_product_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._proc_item_for_product(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._direct_recv_recalc(p_order_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE procurement_orders SET total_amount = (SELECT coalesce(sum(total_price),0) FROM procurement_order_items WHERE order_id = p_order_id), updated_at = now()
  WHERE id = p_order_id;
$$;
REVOKE ALL ON FUNCTION public._direct_recv_recalc(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.direct_receiving_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees;
BEGIN
  e := _direct_recv_employee();
  RETURN jsonb_build_object(
    'employee_id', e.id, 'employee_name', e.full_name,
    'suppliers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
                  FROM pos_suppliers s WHERE s.user_id = e.user_id AND coalesce(s.is_active, true)), '[]'),
    'branches', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) ORDER BY b.name)
                  FROM branches b WHERE b.user_id = e.user_id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_my_orders()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees;
BEGIN
  e := _direct_recv_employee();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status, 'review_status', o.review_status,
      'reject_reason', o.reject_reason, 'supplier_name', s.name, 'created_at', o.created_at,
      'lines', (SELECT count(*) FROM procurement_order_items i WHERE i.order_id = o.id),
      'total', o.total_amount) ORDER BY o.created_at DESC)
    FROM procurement_orders o LEFT JOIN pos_suppliers s ON s.id = o.supplier_id
    WHERE o.source = 'direct_receiving' AND o.submitted_by_employee_id = e.id
      AND o.created_at > now() - interval '60 days'), '[]');
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_start(p_supplier_id uuid, p_branch_id uuid, p_supplier_invoice_no text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees; v_id uuid;
BEGIN
  e := _direct_recv_employee();
  IF NOT EXISTS (SELECT 1 FROM pos_suppliers WHERE id = p_supplier_id AND user_id = e.user_id) THEN RAISE EXCEPTION 'اختر المورد'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND user_id = e.user_id) THEN RAISE EXCEPTION 'فرع غير صحيح'; END IF;
  INSERT INTO procurement_orders(user_id, branch_id, supplier_id, order_date, status, total_amount, notes, created_by,
    source, supplier_invoice_no, review_status, submitted_by_employee_id)
  VALUES (e.user_id, p_branch_id, p_supplier_id, (now() AT TIME ZONE 'Asia/Hebron')::date, 'draft', 0, NULLIF(btrim(p_notes),''), auth.uid(),
    'direct_receiving', NULLIF(btrim(p_supplier_invoice_no),''), 'in_progress', e.id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_get(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.employees; o record;
BEGIN
  e := _direct_recv_employee();
  SELECT o2.*, s.name AS supplier_name, b.name AS branch_name INTO o
  FROM procurement_orders o2 LEFT JOIN pos_suppliers s ON s.id = o2.supplier_id LEFT JOIN branches b ON b.id = o2.branch_id
  WHERE o2.id = p_order_id AND o2.source = 'direct_receiving' AND o2.submitted_by_employee_id = e.id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'الاستلام غير موجود'; END IF;
  RETURN jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status, 'review_status', o.review_status,
    'reject_reason', o.reject_reason, 'supplier_id', o.supplier_id, 'supplier_name', o.supplier_name,
    'branch_id', o.branch_id, 'branch_name', o.branch_name, 'supplier_invoice_no', o.supplier_invoice_no,
    'notes', o.notes, 'attachment_path', o.attachment_path, 'total', o.total_amount,
    'lines', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'item_name', i.item_name, 'unit', i.unit,
        'quantity', i.quantity, 'unit_price', i.unit_price, 'total_price', i.total_price, 'notes', i.notes,
        'is_temp', i.product_id IS NULL, 'barcode', coalesce(i.temp_barcode, p.barcode), 'temp_photo_path', i.temp_photo_path)
        ORDER BY i.item_name)
      FROM procurement_order_items i LEFT JOIN procurement_items pi ON pi.id = i.product_id LEFT JOIN products p ON p.id = pi.inventory_product_id
      WHERE i.order_id = o.id), '[]'));
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_scan(p_order_id uuid, p_barcode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders; v_code text := btrim(coalesce(p_barcode,'')); pr record; v_item uuid; v_line uuid; v_name text;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  IF v_code = '' THEN RAISE EXCEPTION 'باركود فارغ'; END IF;
  SELECT id, name, unit, buy_price INTO pr FROM products
   WHERE user_id = o.user_id AND barcode = v_code AND coalesce(is_deleted,false) = false LIMIT 1;
  IF pr.id IS NULL THEN
    SELECT id, item_name INTO v_line, v_name FROM procurement_order_items WHERE order_id = p_order_id AND temp_barcode = v_code AND product_id IS NULL LIMIT 1;
    IF v_line IS NULL THEN RETURN jsonb_build_object('matched', false, 'barcode', v_code); END IF;
  ELSE
    v_item := _proc_item_for_product(pr.id);
    v_name := pr.name;
    SELECT id INTO v_line FROM procurement_order_items WHERE order_id = p_order_id AND product_id = v_item LIMIT 1;
    IF v_line IS NULL THEN
      INSERT INTO procurement_order_items(order_id, product_id, item_name, unit, quantity, unit_price, total_price, branch_id)
      VALUES (p_order_id, v_item, pr.name, coalesce(nullif(pr.unit,''),'قطعة'), 1, 0, 0, o.branch_id)
      RETURNING id INTO v_line;
      RETURN jsonb_build_object('matched', true, 'line_id', v_line, 'item_name', v_name, 'new', true);
    END IF;
  END IF;
  UPDATE procurement_order_items SET quantity = quantity + 1, total_price = round((quantity + 1) * unit_price, 2) WHERE id = v_line;
  PERFORM _direct_recv_recalc(p_order_id);
  RETURN jsonb_build_object('matched', true, 'line_id', v_line, 'item_name', v_name, 'new', false);
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_add_temp(p_order_id uuid, p_barcode text, p_name text, p_unit text DEFAULT 'قطعة', p_photo_path text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders; v_id uuid;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  IF btrim(coalesce(p_name,'')) = '' THEN RAISE EXCEPTION 'اكتب اسم الصنف'; END IF;
  INSERT INTO procurement_order_items(order_id, product_id, item_name, unit, quantity, unit_price, total_price, branch_id, temp_barcode, temp_photo_path)
  VALUES (p_order_id, NULL, left(btrim(p_name), 200), coalesce(nullif(btrim(p_unit),''),'قطعة'), 1, 0, 0, o.branch_id,
          NULLIF(btrim(coalesce(p_barcode,'')),''), NULLIF(p_photo_path,''))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_set_line(p_line_id uuid, p_quantity numeric, p_unit_price numeric, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid; o public.procurement_orders;
BEGIN
  SELECT order_id INTO v_order FROM procurement_order_items WHERE id = p_line_id;
  o := _direct_recv_my_draft(v_order);
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'سعر غير صحيح'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    DELETE FROM procurement_order_items WHERE id = p_line_id;
  ELSE
    UPDATE procurement_order_items SET quantity = p_quantity, unit_price = round(p_unit_price, 2),
      total_price = round(p_quantity * round(p_unit_price, 2), 2), notes = NULLIF(btrim(coalesce(p_notes,'')),'')
    WHERE id = p_line_id;
  END IF;
  PERFORM _direct_recv_recalc(v_order);
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_update_header(p_order_id uuid, p_supplier_id uuid, p_branch_id uuid, p_supplier_invoice_no text, p_notes text, p_attachment_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  IF NOT EXISTS (SELECT 1 FROM pos_suppliers WHERE id = p_supplier_id AND user_id = o.user_id) THEN RAISE EXCEPTION 'اختر المورد'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND user_id = o.user_id) THEN RAISE EXCEPTION 'فرع غير صحيح'; END IF;
  UPDATE procurement_orders SET supplier_id = p_supplier_id, branch_id = p_branch_id,
    supplier_invoice_no = NULLIF(btrim(coalesce(p_supplier_invoice_no,'')),''), notes = NULLIF(btrim(coalesce(p_notes,'')),''),
    attachment_path = NULLIF(p_attachment_path,''), updated_at = now()
  WHERE id = p_order_id;
  UPDATE procurement_order_items SET branch_id = p_branch_id WHERE order_id = p_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_discard(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  UPDATE procurement_orders SET status = 'cancelled', review_status = 'discarded', updated_at = now() WHERE id = p_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_submit(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders; e public.employees; v_sid uuid;
BEGIN
  o := _direct_recv_my_draft(p_order_id);
  e := _direct_recv_employee();
  IF o.supplier_id IS NULL THEN RAISE EXCEPTION 'اختر المورد'; END IF;
  IF NOT EXISTS (SELECT 1 FROM procurement_order_items WHERE order_id = p_order_id) THEN RAISE EXCEPTION 'لا يوجد أصناف مستلمة'; END IF;
  IF EXISTS (SELECT 1 FROM procurement_order_items WHERE order_id = p_order_id AND unit_price <= 0) THEN
    RAISE EXCEPTION 'أدخل سعر الفاتورة لكل الأصناف';
  END IF;
  PERFORM _direct_recv_recalc(p_order_id);
  UPDATE procurement_orders SET status = 'sent', review_status = 'pending_review', updated_at = now() WHERE id = p_order_id;
  INSERT INTO procurement_receiving_sessions(owner_id, order_id, assigned_employee_id, assigned_auth_user_id, status, started_at, submitted_at, created_by)
  VALUES (o.user_id, p_order_id, e.id, auth.uid(), 'submitted', now(), now(), auth.uid()) RETURNING id INTO v_sid;
  INSERT INTO procurement_receiving_lines(session_id, order_item_id, product_id, scanned_qty, note, barcodes)
  SELECT v_sid, i.id, (SELECT pi.inventory_product_id FROM procurement_items pi WHERE pi.id = i.product_id), i.quantity, i.notes,
         CASE WHEN i.temp_barcode IS NOT NULL THEN ARRAY[i.temp_barcode] ELSE '{}'::text[] END
  FROM procurement_order_items i WHERE i.order_id = p_order_id;
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_reject(p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.procurement_orders;
BEGIN
  SELECT * INTO o FROM procurement_orders WHERE id = p_order_id FOR UPDATE;
  IF o.id IS NULL OR o.source <> 'direct_receiving' THEN RAISE EXCEPTION 'الطلبية غير موجودة'; END IF;
  IF NOT is_team_member(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  IF coalesce(o.review_status,'') <> 'pending_review' THEN RAISE EXCEPTION 'الطلبية ليست بانتظار التدقيق'; END IF;
  IF btrim(coalesce(p_reason,'')) = '' THEN RAISE EXCEPTION 'اكتب سبب الرفض'; END IF;
  UPDATE procurement_orders SET status = 'cancelled', review_status = 'rejected', reject_reason = btrim(p_reason), updated_at = now() WHERE id = p_order_id;
  UPDATE procurement_receiving_sessions SET status = 'cancelled', updated_at = now() WHERE order_id = p_order_id AND status <> 'cancelled';
END $$;

CREATE OR REPLACE FUNCTION public.direct_receiving_link_temp_line(p_line_id uuid, p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; o public.procurement_orders; pr record; v_item uuid;
BEGIN
  SELECT * INTO i FROM procurement_order_items WHERE id = p_line_id;
  SELECT * INTO o FROM procurement_orders WHERE id = i.order_id FOR UPDATE;
  IF o.id IS NULL OR NOT is_team_member(auth.uid(), o.user_id) THEN RAISE EXCEPTION 'لا تملك صلاحية'; END IF;
  IF i.product_id IS NOT NULL THEN RAISE EXCEPTION 'البند مربوط مسبقاً'; END IF;
  SELECT * INTO pr FROM products WHERE id = p_product_id AND user_id = o.user_id;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
  IF i.temp_barcode IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE user_id = o.user_id AND barcode = i.temp_barcode AND id <> pr.id) THEN
    RAISE EXCEPTION 'باركود البند مستخدم لصنف آخر';
  END IF;
  v_item := _proc_item_for_product(pr.id);
  UPDATE procurement_order_items SET product_id = v_item, item_name = pr.name WHERE id = p_line_id;
  UPDATE procurement_receiving_lines SET product_id = pr.id WHERE order_item_id = p_line_id;
  IF i.temp_barcode IS NOT NULL THEN
    UPDATE products SET barcode = i.temp_barcode, updated_at = now() WHERE id = pr.id AND (barcode IS NULL OR btrim(barcode) = '');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_direct_recv_mark_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.procurement_order_id IS NOT NULL AND coalesce(NEW.status,'') NOT IN ('cancelled','rejected') THEN
    UPDATE procurement_orders SET review_status = 'approved'
     WHERE id = NEW.procurement_order_id AND source = 'direct_receiving' AND review_status = 'pending_review';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS direct_recv_mark_approved ON public.purchase_invoices;
CREATE TRIGGER direct_recv_mark_approved AFTER INSERT ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_direct_recv_mark_approved();

CREATE OR REPLACE FUNCTION public.procurement_order_edit_block_reason(p_order_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM procurement_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN 'الطلبية غير موجودة'; END IF;
  IF NOT is_team_member(auth.uid(), o.user_id) THEN RETURN 'لا تملك صلاحية على هذه الطلبية'; END IF;
  IF o.source = 'direct_receiving' AND o.status = 'draft' THEN RETURN 'الموظف ما زال يعمل على هذا الاستلام'; END IF;
  IF o.status NOT IN ('draft','sent','partially_received') THEN
    RETURN 'لا يمكن تعديل طلبية بحالة ' || coalesce(o.status,'');
  END IF;
  IF o.source = 'direct_receiving' AND o.review_status = 'pending_review' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM procurement_receiving_sessions s
             WHERE s.order_id = p_order_id AND s.status NOT IN ('cancelled','approved')) THEN
    RETURN 'الاستلام بالمستودع جارٍ أو مُرسل على هذه الطلبية';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_direct_recv_sync_session()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order uuid := NEW.order_id; v_sid uuid;
BEGIN
  SELECT s.id INTO v_sid FROM procurement_receiving_sessions s JOIN procurement_orders o ON o.id = s.order_id
   WHERE s.order_id = v_order AND s.status = 'submitted' AND o.source = 'direct_receiving' AND o.review_status = 'pending_review'
   ORDER BY s.submitted_at DESC LIMIT 1;
  IF v_sid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO procurement_receiving_lines(session_id, order_item_id, product_id, scanned_qty, note)
    VALUES (v_sid, NEW.id, (SELECT inventory_product_id FROM procurement_items WHERE id = NEW.product_id), NEW.quantity, NEW.notes);
  ELSE
    UPDATE procurement_receiving_lines SET scanned_qty = NEW.quantity,
      product_id = coalesce((SELECT inventory_product_id FROM procurement_items WHERE id = NEW.product_id), product_id)
     WHERE session_id = v_sid AND order_item_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS direct_recv_sync_session ON public.procurement_order_items;
CREATE TRIGGER direct_recv_sync_session AFTER INSERT OR UPDATE OF quantity, product_id ON public.procurement_order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_direct_recv_sync_session();

CREATE OR REPLACE FUNCTION public.update_procurement_order(p_order_id uuid, p_header jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record; v_reason text; v_before jsonb; v_after jsonb;
  it jsonb; v_id uuid; v_qty numeric; v_price numeric; v_recv numeric;
  v_keep uuid[] := '{}'; r record; v_has_invoice boolean; v_total numeric; v_direct boolean;
BEGIN
  SELECT * INTO o FROM procurement_orders WHERE id = p_order_id FOR UPDATE;
  v_reason := procurement_order_edit_block_reason(p_order_id);
  IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'لا يمكن حفظ طلبية بلا بنود';
  END IF;
  v_direct := o.source = 'direct_receiving' AND o.review_status = 'pending_review';

  v_has_invoice := EXISTS (SELECT 1 FROM purchase_invoices pi WHERE pi.procurement_order_id = p_order_id
                           AND coalesce(pi.status,'') NOT IN ('cancelled','rejected'));
  IF v_has_invoice AND (p_header->>'supplier_id') IS NOT NULL
     AND (p_header->>'supplier_id')::uuid IS DISTINCT FROM o.supplier_id THEN
    RAISE EXCEPTION 'لا يمكن تغيير المورد بعد فوترة جزء من الطلبية';
  END IF;

  v_before := jsonb_build_object('order', to_jsonb(o),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM procurement_order_items i WHERE i.order_id = p_order_id), '[]'));

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (it->>'quantity')::numeric;
    v_price := coalesce((it->>'unit_price')::numeric, 0);
    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صحيحة للبند %', it->>'item_name'; END IF;
    IF v_price < 0 THEN RAISE EXCEPTION 'سعر غير صحيح للبند %', it->>'item_name'; END IF;
    v_id := NULLIF(it->>'id','')::uuid;
    IF v_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM procurement_order_items WHERE id = v_id AND order_id = p_order_id) THEN
        RAISE EXCEPTION 'بند لا يتبع هذه الطلبية';
      END IF;
      v_recv := _procurement_item_received_qty(v_id);
      IF v_qty < v_recv THEN
        RAISE EXCEPTION 'كمية البند % أقل من المستلم (%)', it->>'item_name', v_recv;
      END IF;
      UPDATE procurement_order_items SET
        quantity = v_qty, unit_price = v_price, total_price = round(v_qty * v_price, 2),
        unit = coalesce(it->>'unit', unit),
        notes = NULLIF(it->>'notes',''),
        branch_id = NULLIF(it->>'branch_id','')::uuid,
        product_id = CASE WHEN v_recv > 0 THEN product_id ELSE NULLIF(it->>'product_id','')::uuid END,
        item_name = CASE WHEN v_recv > 0 THEN item_name ELSE coalesce(it->>'item_name', item_name) END
      WHERE id = v_id;
      v_keep := v_keep || v_id;
    ELSE
      INSERT INTO procurement_order_items(order_id, product_id, item_name, unit, quantity, unit_price, total_price, branch_id, notes)
      VALUES (p_order_id, NULLIF(it->>'product_id','')::uuid, it->>'item_name', it->>'unit', v_qty, v_price,
              round(v_qty * v_price, 2), NULLIF(it->>'branch_id','')::uuid, NULLIF(it->>'notes',''))
      RETURNING id INTO v_id;
      v_keep := v_keep || v_id;
    END IF;
  END LOOP;

  FOR r IN SELECT id, item_name FROM procurement_order_items WHERE order_id = p_order_id AND NOT (id = ANY(v_keep)) LOOP
    IF EXISTS (SELECT 1 FROM purchase_invoice_items WHERE procurement_order_item_id = r.id)
       OR (NOT v_direct AND EXISTS (SELECT 1 FROM procurement_receiving_lines WHERE order_item_id = r.id)) THEN
      RAISE EXCEPTION 'لا يمكن حذف البند % لأنه مرتبط باستلام أو فاتورة', r.item_name;
    END IF;
    DELETE FROM procurement_order_items WHERE id = r.id;
  END LOOP;

  SELECT coalesce(sum(total_price),0) INTO v_total FROM procurement_order_items WHERE order_id = p_order_id;
  UPDATE procurement_orders SET
    supplier_id = coalesce(NULLIF(p_header->>'supplier_id','')::uuid, supplier_id),
    branch_id = CASE WHEN p_header ? 'branch_id' THEN NULLIF(p_header->>'branch_id','')::uuid ELSE branch_id END,
    order_date = coalesce(NULLIF(p_header->>'order_date','')::date, order_date),
    expected_delivery_date = CASE WHEN p_header ? 'expected_delivery_date' THEN NULLIF(p_header->>'expected_delivery_date','')::date ELSE expected_delivery_date END,
    notes = CASE WHEN p_header ? 'notes' THEN NULLIF(p_header->>'notes','') ELSE notes END,
    total_amount = v_total,
    updated_at = now()
  WHERE id = p_order_id;

  v_after := jsonb_build_object('order', (SELECT to_jsonb(x) FROM procurement_orders x WHERE x.id = p_order_id),
    'items', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM procurement_order_items i WHERE i.order_id = p_order_id), '[]'));
  INSERT INTO procurement_order_edits(order_id, owner_id, edited_by, status_at_edit, before_data, after_data)
  VALUES (p_order_id, o.user_id, auth.uid(), o.status, v_before, v_after);

  RETURN jsonb_build_object('ok', true, 'total_amount', v_total);
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['direct_receiving_context()','direct_receiving_my_orders()',
    'direct_receiving_start(uuid,uuid,text,text)','direct_receiving_get(uuid)','direct_receiving_scan(uuid,text)',
    'direct_receiving_add_temp(uuid,text,text,text,text)','direct_receiving_set_line(uuid,numeric,numeric,text)',
    'direct_receiving_update_header(uuid,uuid,uuid,text,text,text)','direct_receiving_discard(uuid)','direct_receiving_submit(uuid)',
    'direct_receiving_reject(uuid,text)','direct_receiving_link_temp_line(uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

CREATE POLICY "direct receiving upload own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'direct-receiving' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "direct receiving read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'direct-receiving' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.procurement_orders o WHERE o.attachment_path = storage.objects.name AND public.is_team_member(auth.uid(), o.user_id))
    OR EXISTS (SELECT 1 FROM public.procurement_order_items i JOIN public.procurement_orders o ON o.id = i.order_id
               WHERE i.temp_photo_path = storage.objects.name AND public.is_team_member(auth.uid(), o.user_id))));