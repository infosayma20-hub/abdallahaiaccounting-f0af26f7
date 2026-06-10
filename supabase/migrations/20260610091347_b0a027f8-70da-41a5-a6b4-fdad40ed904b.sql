-- Fix reverse_invoice_stock: handle stock_movements written by the frontend (which
-- never populated reference_id/reference_type) and also reflect the reversal in
-- products.quantity (the writer-side path mutates products.quantity directly).
CREATE OR REPLACE FUNCTION public.reverse_invoice_stock(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_invoice_type text;
  v_invoice_number text;
  v_inserted int := 0;
  r record;
  v_reversal_type stock_movement_type;
  v_product_delta numeric;
BEGIN
  SELECT user_id, invoice_type, invoice_number
    INTO v_user_id, v_invoice_type, v_invoice_number
  FROM public.invoices WHERE id = p_invoice_id;

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT sm.id, sm.product_id, sm.quantity, sm.movement_type, sm.warehouse_id,
           sm.unit_cost, sm.reference_note
    FROM public.stock_movements sm
    WHERE (
            (sm.reference_id = p_invoice_id AND sm.reference_type = 'invoice')
            OR (
              sm.reference_id IS NULL
              AND sm.user_id = v_user_id
              AND v_invoice_number IS NOT NULL
              AND sm.reference_note ILIKE '%' || v_invoice_number || '%'
              AND sm.reference_note NOT ILIKE 'عكس حركة%'
            )
          )
  LOOP
    -- Idempotency: skip if reversal row already exists for this original
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

    -- Apply offset to products.quantity (writer-side path updates this column directly,
    -- so a stock_movements row alone wouldn't change on-hand stock).
    v_product_delta := CASE
      WHEN r.movement_type::text = 'وارد' THEN -1 * r.quantity   -- undo inbound
      WHEN r.movement_type::text = 'صادر' THEN  1 * r.quantity   -- undo outbound
      ELSE 0
    END;
    IF v_product_delta <> 0 THEN
      UPDATE public.products
         SET quantity = COALESCE(quantity, 0) + v_product_delta
       WHERE id = r.product_id;
    END IF;

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END $function$;

-- Backfill the specific invoice reported by samibags1995@gmail.com (PO-2026-0001).
-- Safe to run again — idempotent via reverse_of:<id> guard.
SELECT public.reverse_invoice_stock('8aee0d0b-b402-4287-8082-0fde6f8c9ea6'::uuid);