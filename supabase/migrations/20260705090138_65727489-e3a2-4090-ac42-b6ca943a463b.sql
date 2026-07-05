CREATE OR REPLACE FUNCTION public.guard_voucher_must_have_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'posted' THEN
    -- Bulk vouchers live in public.vouchers and create multiple transactions,
    -- so they legitimately do not have one linked_transaction_id.
    -- Use to_jsonb(NEW) so this trigger also works on receipt_vouchers,
    -- which does not have a subtype column.
    IF TG_TABLE_NAME = 'vouchers'
       AND COALESCE(to_jsonb(NEW)->>'subtype', '') = 'bulk' THEN
      RETURN NEW;
    END IF;

    IF NEW.linked_transaction_id IS NULL THEN
      RAISE EXCEPTION 'لا يمكن ترحيل السند بدون قيد محاسبي مرتبط (linked_transaction_id فارغ)'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.id = NEW.linked_transaction_id
        AND t.user_id = NEW.user_id
        AND COALESCE(t.is_deleted, false) = false
    ) THEN
      RAISE EXCEPTION 'لا يمكن ترحيل السند: القيد المحاسبي المرتبط غير موجود أو محذوف'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_receipt_voucher_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year text;
  v_next int;
  v_lock_key bigint;
  v_existing_ref text;
BEGIN
  v_year := to_char(COALESCE(NEW.payment_date, NEW.created_at::date, CURRENT_DATE), 'YYYY');
  v_existing_ref := btrim(COALESCE(NEW.receipt_number, ''));

  -- Preserve genuinely manual receipt numbers, but never trust UI-generated
  -- REC-YYYY-#### numbers. Those must be allocated here under a DB lock.
  IF v_existing_ref <> ''
     AND v_existing_ref !~ '^REC-\d{4}-\d+$' THEN
    NEW.receipt_number := v_existing_ref;
    RETURN NEW;
  END IF;

  v_lock_key := ('x' || substr(md5(NEW.user_id::text || '|receipt_vouchers'), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_number, '^REC-\d{4}-', ''), '')::int), 0) + 1
    INTO v_next
    FROM public.receipt_vouchers
   WHERE user_id = NEW.user_id
     AND receipt_number ~ ('^REC-' || v_year || '-\d+$');

  NEW.receipt_number := 'REC-' || v_year || '-' || LPAD(v_next::text, 4, '0');
  RETURN NEW;
END;
$function$;