-- Allow bulk vouchers to post without a single linked_transaction_id.
-- Bulk vouchers create N transactions (one per party line), not a single journal.
-- Integrity is ensured by voucher_lines + per-line transactions with reference=ref_number.
CREATE OR REPLACE FUNCTION public.guard_voucher_must_have_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'posted' THEN
    -- Exempt bulk vouchers: they create multiple transactions (BULK-<ref>-<n>)
    IF COALESCE(NEW.subtype, '') = 'bulk' THEN
      RETURN NEW;
    END IF;

    IF NEW.linked_transaction_id IS NULL THEN
      RAISE EXCEPTION 'لا يمكن ترحيل السند بدون قيد محاسبي مرتبط (linked_transaction_id فارغ)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = NEW.linked_transaction_id
        AND COALESCE(t.is_deleted, false) = false
    ) THEN
      RAISE EXCEPTION 'لا يمكن ترحيل السند: القيد المحاسبي المرتبط غير موجود أو محذوف'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;