-- Defense-in-depth guard: block posted receipt/payment vouchers without a real linked transaction.
CREATE OR REPLACE FUNCTION public.guard_voucher_must_have_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'posted' THEN
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
$$;

DROP TRIGGER IF EXISTS trg_guard_receipt_voucher_must_have_journal ON public.receipt_vouchers;
CREATE TRIGGER trg_guard_receipt_voucher_must_have_journal
BEFORE INSERT OR UPDATE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.guard_voucher_must_have_journal();

DROP TRIGGER IF EXISTS trg_guard_voucher_must_have_journal ON public.vouchers;
CREATE TRIGGER trg_guard_voucher_must_have_journal
BEFORE INSERT OR UPDATE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.guard_voucher_must_have_journal();