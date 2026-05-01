-- void_rep_sale_atomic: cancel a posted rep sale invoice safely
CREATE OR REPLACE FUNCTION public.void_rep_sale_atomic(
  p_invoice_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_item RECORD;
  v_reverse_tx_id uuid;
  v_caller uuid := auth.uid();
  v_disable_stock boolean;
  v_movements_count int := 0;
  v_period_locked boolean := false;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'سبب الإلغاء مطلوب (3 حروف على الأقل)';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.source IS DISTINCT FROM 'rep' THEN
    RAISE EXCEPTION 'هذه الدالة مخصصة لفواتير المندوبين فقط';
  END IF;

  IF v_inv.status IN ('cancelled','void') THEN
    RAISE EXCEPTION 'الطلب ملغى مسبقاً';
  END IF;

  IF v_inv.linked_transaction_id IS NULL THEN
    RAISE EXCEPTION 'هذه الفاتورة غير مرحّلة (Draft) — استخدم الحذف بدلاً من الإلغاء';
  END IF;

  -- Fiscal period check (if fiscal_periods table exists with locked flag)
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.fiscal_periods fp
       WHERE fp.user_id = v_inv.user_id
         AND v_inv.invoice_date BETWEEN fp.start_date AND fp.end_date
         AND COALESCE(fp.is_closed, false) = true
    ) INTO v_period_locked;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_period_locked := false;
  END;
  IF v_period_locked THEN
    RAISE EXCEPTION 'لا يمكن إلغاء طلب ضمن فترة مالية مقفلة';
  END IF;

  -- 1) Reverse the journal entry (creates REV transaction, soft-deletes original)
  v_reverse_tx_id := public.create_reverse_entry(
    v_inv.linked_transaction_id,
    'إلغاء طلب مندوب ' || v_inv.invoice_number || ' — ' || p_reason,
    v_caller
  );

  -- 2) Reverse stock movements: insert 'وارد' for each prior 'صادر' tied to this invoice
  SELECT COALESCE(rep_disable_stock_deduction,false) INTO v_disable_stock
    FROM public.company_settings WHERE user_id = v_inv.user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock, false);

  IF NOT v_disable_stock AND v_inv.warehouse_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity
        FROM public.invoice_items
       WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL
    LOOP
      INSERT INTO public.stock_movements (user_id, product_id, warehouse_id, movement_type, quantity, reference_note)
      VALUES (v_inv.user_id, v_item.product_id, v_inv.warehouse_id, 'وارد', v_item.quantity,
              'إلغاء فاتورة مندوب ' || v_inv.invoice_number);

      UPDATE public.products
         SET quantity = COALESCE(quantity,0) + v_item.quantity,
             updated_at = now()
       WHERE id = v_item.product_id AND user_id = v_inv.user_id;

      v_movements_count := v_movements_count + 1;
    END LOOP;
  END IF;

  -- 3) Mark invoice as cancelled (preserve items + history)
  UPDATE public.invoices
     SET status = 'cancelled',
         notes_internal = COALESCE(notes_internal,'') ||
           E'\n[CANCELLED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] reason=' || p_reason ||
           ' reverse_tx=' || v_reverse_tx_id::text
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'reverse_transaction_id', v_reverse_tx_id,
    'stock_movements_reversed', v_movements_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.void_rep_sale_atomic(uuid, text) TO authenticated;