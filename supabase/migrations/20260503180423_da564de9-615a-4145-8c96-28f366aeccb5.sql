CREATE OR REPLACE FUNCTION public.cascade_invoice_cancel_to_transactions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reverse_id uuid;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
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
        SELECT 1
        FROM public.transactions
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

  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.linked_transaction_id IS NOT NULL THEN
      UPDATE public.transactions
      SET is_deleted = false, reversed_by_id = NULL
      WHERE id = NEW.linked_transaction_id
        AND is_deleted = true;

      UPDATE public.transactions
      SET is_deleted = true
      WHERE reversed_by_id = NEW.linked_transaction_id
        AND transaction_type = 'reversal'
        AND is_deleted = false;
    END IF;

    UPDATE public.invoices
       SET is_voided = false,
           voided_at = NULL,
           void_reason = NULL
     WHERE id = NEW.id
       AND COALESCE(is_voided, false) = true;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rep_invoice_void_legacy(p_invoice_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.linked_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already posted; use void_rep_sale_atomic instead';
  END IF;

  UPDATE public.invoices
     SET status = 'cancelled',
         is_voided = true,
         voided_at = COALESCE(voided_at, now()),
         void_reason = COALESCE(NULLIF(trim(p_reason), ''), 'legacy void'),
         notes_internal = COALESCE(notes_internal, '') || E'\n[VOID-LEGACY] ' || COALESCE(NULLIF(trim(p_reason), ''), 'legacy void')
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'already_voided', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rep_invoice_void_legacy(uuid, text) TO authenticated;

UPDATE public.invoices i
   SET status = 'cancelled',
       is_voided = true,
       voided_at = COALESCE(i.voided_at, now()),
       void_reason = COALESCE(i.void_reason, 'تصحيح حالة إلغاء مرتبطة بقيد عكسي'),
       notes_internal = COALESCE(i.notes_internal, '') ||
         CASE WHEN COALESCE(i.notes_internal, '') ILIKE '%[VOID-BACKFILL%'
              THEN ''
              ELSE E'\n[VOID-BACKFILL ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] reporting cancellation marker normalized'
         END
 WHERE i.source = 'rep'
   AND (
     i.status IN ('cancelled', 'void', 'reversed')
     OR COALESCE(i.is_voided, false) = true
     OR COALESCE(i.notes_internal, '') ILIKE '%[CANCELLED%'
     OR EXISTS (
       SELECT 1
       FROM public.transactions r
       WHERE i.linked_transaction_id IS NOT NULL
         AND COALESCE(r.is_deleted, false) = false
         AND (
           r.reversed_by_id = i.linked_transaction_id
           OR r.id = (SELECT t.reversed_by_id FROM public.transactions t WHERE t.id = i.linked_transaction_id)
         )
     )
   );

CREATE INDEX IF NOT EXISTS idx_invoices_active_reporting
  ON public.invoices (user_id, invoice_type, invoice_date)
  WHERE COALESCE(is_voided, false) = false AND status NOT IN ('cancelled', 'void', 'reversed');