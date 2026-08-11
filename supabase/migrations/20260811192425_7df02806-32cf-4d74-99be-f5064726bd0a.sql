-- 1) reverse_invoice_stock: single writer (movement only), strict reference matching
CREATE OR REPLACE FUNCTION public.reverse_invoice_stock(p_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_invoice_number text;
  v_inserted int := 0;
  r record;
  v_reversal_type stock_movement_type;
BEGIN
  SELECT user_id, invoice_number INTO v_user_id, v_invoice_number
  FROM public.invoices WHERE id = p_invoice_id;

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT sm.id, sm.product_id, sm.quantity, sm.movement_type, sm.warehouse_id, sm.unit_cost
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_invoice_id
      AND sm.reference_type = 'invoice'
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.stock_movements rv
      WHERE rv.reference_id = p_invoice_id
        AND rv.reference_type = 'invoice_void'
        AND rv.product_id = r.product_id
        AND rv.notes = ('reverse_of:'||r.id::text)
    ) THEN
      CONTINUE;
    END IF;

    v_reversal_type := CASE
      WHEN r.movement_type::text = 'صادر' THEN 'وارد'::stock_movement_type
      WHEN r.movement_type::text = 'وارد' THEN 'صادر'::stock_movement_type
      ELSE r.movement_type
    END;

    INSERT INTO public.stock_movements(
      user_id, product_id, movement_type, quantity, reference_note,
      warehouse_id, reference_type, reference_id, notes, unit_cost
    ) VALUES (
      v_user_id, r.product_id, v_reversal_type, r.quantity,
      'عكس حركة بسبب إلغاء فاتورة ' || COALESCE(v_invoice_number, ''),
      r.warehouse_id, 'invoice_void', p_invoice_id,
      'reverse_of:'||r.id::text, r.unit_cost
    );
    -- NOTE: products.quantity is maintained by tg_sync_product_qty_from_stock_movement.
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END $function$;

-- 2) void_rep_sale_atomic: drop the manual products.quantity bump (double count)
CREATE OR REPLACE FUNCTION public.void_rep_sale_atomic(p_invoice_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_item RECORD;
  v_reverse_tx_id uuid;
  v_reverse_cogs_id uuid;
  v_reverse_disc_id uuid;
  v_caller uuid := auth.uid();
  v_disable_stock boolean;
  v_movements_count int := 0;
  v_cogs_tx_id uuid;
  v_disc_tx_id uuid;
  v_existing_sale_reverse_id uuid;
  v_existing_cogs_reverse_id uuid;
  v_existing_disc_reverse_id uuid;
  v_notes_has_cancel boolean := false;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'سبب الإلغاء مطلوب (3 حروف على الأقل)';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.source IS DISTINCT FROM 'rep' THEN
    RAISE EXCEPTION 'هذه الدالة مخصصة لفواتير المندوبين فقط';
  END IF;
  IF v_inv.linked_transaction_id IS NULL THEN
    RAISE EXCEPTION 'هذه الفاتورة غير مرحّلة (Draft) — استخدم الحذف بدلاً من الإلغاء';
  END IF;

  SELECT r.id INTO v_existing_sale_reverse_id
  FROM public.transactions r
  WHERE COALESCE(r.is_deleted,false)=false
    AND (r.reversed_by_id = v_inv.linked_transaction_id
         OR r.id = (SELECT t.reversed_by_id FROM public.transactions t WHERE t.id = v_inv.linked_transaction_id))
  ORDER BY r.created_at DESC LIMIT 1;

  SELECT id INTO v_cogs_tx_id FROM public.transactions
  WHERE user_id = v_inv.user_id AND reference = v_inv.invoice_number
    AND debit_account_code = '5100' AND COALESCE(is_deleted,false)=false
  ORDER BY created_at DESC LIMIT 1;

  IF v_cogs_tx_id IS NOT NULL THEN
    SELECT r.id INTO v_existing_cogs_reverse_id FROM public.transactions r
    WHERE COALESCE(r.is_deleted,false)=false
      AND (r.reversed_by_id = v_cogs_tx_id
           OR r.id = (SELECT t.reversed_by_id FROM public.transactions t WHERE t.id = v_cogs_tx_id))
    ORDER BY r.created_at DESC LIMIT 1;
  END IF;

  SELECT id INTO v_disc_tx_id FROM public.transactions
  WHERE user_id = v_inv.user_id AND reference = v_inv.invoice_number
    AND debit_account_code = '4500' AND COALESCE(is_deleted,false)=false
  ORDER BY created_at DESC LIMIT 1;

  IF v_disc_tx_id IS NOT NULL THEN
    SELECT r.id INTO v_existing_disc_reverse_id FROM public.transactions r
    WHERE COALESCE(r.is_deleted,false)=false
      AND (r.reversed_by_id = v_disc_tx_id
           OR r.id = (SELECT t.reversed_by_id FROM public.transactions t WHERE t.id = v_disc_tx_id))
    ORDER BY r.created_at DESC LIMIT 1;
  END IF;

  v_notes_has_cancel := COALESCE(v_inv.notes_internal,'') ILIKE '%[CANCELLED%';

  IF COALESCE(v_inv.is_voided,false) OR v_inv.status IN ('cancelled','void','reversed') OR v_notes_has_cancel THEN
    IF v_existing_sale_reverse_id IS NOT NULL THEN
      UPDATE public.invoices
         SET status='cancelled', is_voided=true,
             voided_at = COALESCE(voided_at, now()),
             void_reason = COALESCE(void_reason, trim(p_reason)),
             notes_internal = COALESCE(notes_internal,'') ||
               CASE WHEN COALESCE(notes_internal,'') ILIKE '%[SYNC-CANCELLED%' THEN ''
                    ELSE E'\n[SYNC-CANCELLED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] accounting reversal exists; invoice status normalized' END
       WHERE id = p_invoice_id;

      RETURN jsonb_build_object('success',true,'already_voided',true,'invoice_id',p_invoice_id,
        'reverse_transaction_id',v_existing_sale_reverse_id,
        'reverse_cogs_transaction_id',v_existing_cogs_reverse_id,
        'reverse_discount_transaction_id',v_existing_disc_reverse_id,
        'stock_movements_reversed',0);
    END IF;

    UPDATE public.invoices
       SET status='posted', is_voided=false, voided_at=null, void_reason=null,
           notes_internal = COALESCE(notes_internal,'') ||
             E'\n[REPAIR ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] stale cancel marker cleared: no accounting reversal found'
     WHERE id = p_invoice_id;
  END IF;

  IF v_existing_sale_reverse_id IS NOT NULL THEN
    v_reverse_tx_id := v_existing_sale_reverse_id;
  ELSE
    v_reverse_tx_id := public.create_reverse_entry(
      v_inv.linked_transaction_id,
      'إلغاء طلب مندوب ' || v_inv.invoice_number || ' — ' || trim(p_reason),
      v_caller);
  END IF;

  IF v_cogs_tx_id IS NOT NULL THEN
    v_reverse_cogs_id := COALESCE(v_existing_cogs_reverse_id,
      public.create_reverse_entry(v_cogs_tx_id, 'عكس تكلفة بضاعة مباعة - إلغاء ' || v_inv.invoice_number, v_caller));
  END IF;

  IF v_disc_tx_id IS NOT NULL THEN
    v_reverse_disc_id := COALESCE(v_existing_disc_reverse_id,
      public.create_reverse_entry(v_disc_tx_id, 'عكس خصم مبيعات - إلغاء ' || v_inv.invoice_number, v_caller));
  END IF;

  SELECT COALESCE(rep_disable_stock_deduction,false) INTO v_disable_stock
  FROM public.company_settings WHERE user_id = v_inv.user_id LIMIT 1;
  v_disable_stock := COALESCE(v_disable_stock,false);

  IF NOT v_disable_stock AND v_inv.warehouse_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity FROM public.invoice_items
      WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.user_id = v_inv.user_id
          AND sm.product_id = v_item.product_id
          AND sm.movement_type = 'وارد'
          AND (sm.reference_note = 'إلغاء فاتورة مندوب ' || v_inv.invoice_number
               OR (sm.reference_type = 'invoice_void' AND sm.reference_id = p_invoice_id))
      ) THEN
        INSERT INTO public.stock_movements (user_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, reference_note)
        VALUES (v_inv.user_id, v_item.product_id, v_inv.warehouse_id, 'وارد', v_item.quantity,
                'invoice_void', p_invoice_id, 'إلغاء فاتورة مندوب ' || v_inv.invoice_number);
        -- products.quantity handled by tg_sync_product_qty_from_stock_movement (no manual bump)
        v_movements_count := v_movements_count + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.invoices
     SET status='cancelled', is_voided=true, voided_at=now(), void_reason=trim(p_reason),
         notes_internal = COALESCE(notes_internal,'') ||
           E'\n[CANCELLED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || '] reason=' || trim(p_reason) ||
           ' reverse_tx=' || v_reverse_tx_id::text ||
           CASE WHEN v_reverse_cogs_id IS NOT NULL THEN ' reverse_cogs=' || v_reverse_cogs_id::text ELSE '' END ||
           CASE WHEN v_reverse_disc_id IS NOT NULL THEN ' reverse_disc=' || v_reverse_disc_id::text ELSE '' END
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success',true,'already_voided',false,'invoice_id',p_invoice_id,
    'reverse_transaction_id',v_reverse_tx_id,
    'reverse_cogs_transaction_id',v_reverse_cogs_id,
    'reverse_discount_transaction_id',v_reverse_disc_id,
    'stock_movements_reversed',v_movements_count);
END;
$function$;

-- 3) Data repair for شركه ليون: drop surplus void rows, then rebuild quantities from movements
WITH ranked AS (
  SELECT sm.id,
         row_number() OVER (PARTITION BY sm.product_id, sm.reference_id, sm.movement_type ORDER BY sm.created_at, sm.id) AS rn
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  WHERE p.user_id = '6fb346d9-f8a6-44a7-a99c-fd2b440f6060'
    AND (sm.reference_type = 'invoice_void' OR sm.reference_note ILIKE 'إلغاء فاتورة مندوب%')
)
DELETE FROM public.stock_movements s USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- remove reversal rows whose direction does not offset an existing invoice movement
DELETE FROM public.stock_movements s
USING public.products p
WHERE s.product_id = p.id
  AND p.user_id = '6fb346d9-f8a6-44a7-a99c-fd2b440f6060'
  AND s.reference_type = 'invoice_void'
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements o
    WHERE o.reference_id = s.reference_id
      AND o.reference_type = 'invoice'
      AND o.product_id = s.product_id
      AND o.movement_type <> s.movement_type
  );

UPDATE public.products p
   SET quantity = calc.qty, updated_at = now()
FROM (
  SELECT pr.id,
         COALESCE(SUM(CASE WHEN sm.movement_type = 'وارد' THEN sm.quantity
                           WHEN sm.movement_type = 'صادر' THEN -sm.quantity
                           ELSE sm.quantity END), 0) AS qty
  FROM public.products pr
  LEFT JOIN public.stock_movements sm ON sm.product_id = pr.id
  WHERE pr.user_id = '6fb346d9-f8a6-44a7-a99c-fd2b440f6060'
  GROUP BY pr.id
) calc
WHERE p.id = calc.id AND p.quantity IS DISTINCT FROM calc.qty;