
CREATE OR REPLACE FUNCTION public.guard_voucher_must_have_journal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'posted' THEN
    IF NEW.linked_transaction_id IS NULL THEN
      RAISE EXCEPTION 'لا يمكن ترحيل سند بدون قيد محاسبي (linked_transaction_id is NULL). ref=%',
        COALESCE(NEW.ref_number, NEW.id::text) USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE id = NEW.linked_transaction_id
        AND user_id = NEW.user_id
        AND COALESCE(is_deleted, false) = false
    ) THEN
      RAISE EXCEPTION 'القيد المرتبط بالسند % غير موجود أو محذوف', NEW.ref_number
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
