
-- ============================================================
-- Phase 1A — Future-safe accounting guards (non-blocking for invoices)
-- ============================================================

-- 1) Helper: idempotent stock reversal for a cancelled invoice
CREATE OR REPLACE FUNCTION public.reverse_invoice_stock(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice_type text;
  v_inserted int := 0;
  r record;
  v_reversal_type stock_movement_type;
BEGIN
  SELECT user_id, invoice_type INTO v_user_id, v_invoice_type
  FROM public.invoices WHERE id = p_invoice_id;

  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- For every original stock movement tied to this invoice, ensure
  -- there is an offsetting movement tagged 'invoice_void'.
  FOR r IN
    SELECT sm.id, sm.product_id, sm.quantity, sm.movement_type, sm.warehouse_id,
           sm.unit_cost, sm.reference_note
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_invoice_id
      AND sm.reference_type = 'invoice'
  LOOP
    -- Skip if a reversal already exists for this specific original movement
    IF EXISTS (
      SELECT 1 FROM public.stock_movements rv
      WHERE rv.reference_id = p_invoice_id
        AND rv.reference_type = 'invoice_void'
        AND rv.product_id = r.product_id
        AND rv.notes = ('reverse_of:'||r.id::text)
    ) THEN
      CONTINUE;
    END IF;

    -- Flip direction: 'صادر' -> 'وارد', 'وارد' -> 'صادر'
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
      'عكس حركة بسبب إلغاء فاتورة',
      r.warehouse_id, 'invoice_void', p_invoice_id,
      'reverse_of:'||r.id::text, r.unit_cost
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END $$;

-- 2) Extend the existing cancel cascade to also reverse stock
CREATE OR REPLACE FUNCTION public.cascade_invoice_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reverse_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    -- (a) reverse linked journal entry (unchanged)
    IF NEW.linked_transaction_id IS NOT NULL THEN
      SELECT COALESCE(t.reversed_by_id, r.id) INTO v_reverse_id
      FROM public.transactions t
      LEFT JOIN public.transactions r
        ON r.reversed_by_id = t.id
       AND COALESCE(r.is_deleted, false) = false
      WHERE t.id = NEW.linked_transaction_id
        AND COALESCE(t.is_deleted, false) = false
      LIMIT 1;

      IF v_reverse_id IS NULL AND EXISTS (
        SELECT 1 FROM public.transactions
        WHERE id = NEW.linked_transaction_id
          AND COALESCE(is_deleted, false) = false
      ) THEN
        SELECT public.create_reverse_entry(
          NEW.linked_transaction_id,
          'إلغاء فاتورة ' || COALESCE(NEW.invoice_number, NEW.id::text),
          NEW.user_id
        ) INTO v_reverse_id;
      END IF;
    END IF;

    -- (b) NEW: reverse stock movements idempotently
    PERFORM public.reverse_invoice_stock(NEW.id);

    -- (c) sync void flags (unchanged)
    UPDATE public.invoices
       SET is_voided = true,
           voided_at = COALESCE(voided_at, now()),
           void_reason = COALESCE(void_reason, 'إلغاء الفاتورة'),
           notes_internal = COALESCE(notes_internal, '') ||
             CASE WHEN COALESCE(notes_internal, '') ILIKE '%[VOID-SYNC%'
                  THEN ''
                  ELSE E'\n[VOID-SYNC ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] cancellation status normalized'
             END
     WHERE id = NEW.id
       AND (COALESCE(is_voided, false) = false OR voided_at IS NULL);
  END IF;

  -- Un-cancel path (unchanged behavior for journal; stock-undo is intentionally NOT auto)
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id AND is_deleted = true;

      UPDATE public.transactions
      SET is_deleted = true
      WHERE reversed_by_id = NEW.linked_transaction_id
        AND transaction_type = 'reversal'
        AND is_deleted = false;
    END IF;

    UPDATE public.invoices
       SET is_voided = false, voided_at = NULL, void_reason = NULL
     WHERE id = NEW.id AND COALESCE(is_voided, false) = true;
  END IF;

  RETURN NEW;
END $$;

-- 3) Voucher posting guard (safe — current FE path always sets linked_transaction_id before status='posted')
CREATE OR REPLACE FUNCTION public.guard_voucher_must_have_journal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'posted' THEN
    IF NEW.linked_transaction_id IS NULL THEN
      RAISE EXCEPTION
        'لا يمكن ترحيل سند بدون قيد محاسبي (linked_transaction_id is NULL). ref=%',
        COALESCE(NEW.ref_number, NEW.id::text)
        USING ERRCODE = 'check_violation';
    END IF;
    -- Verify the linked transaction actually exists & is alive
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE id = NEW.linked_transaction_id
        AND user_id = NEW.user_id
        AND COALESCE(is_deleted, false) = false
    ) THEN
      RAISE EXCEPTION
        'القيد المرتبط بالسند % غير موجود أو محذوف', NEW.ref_number
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_voucher_must_have_journal ON public.vouchers;
CREATE TRIGGER trg_guard_voucher_must_have_journal
BEFORE INSERT OR UPDATE OF status, linked_transaction_id ON public.vouchers
FOR EACH ROW
EXECUTE FUNCTION public.guard_voucher_must_have_journal();
