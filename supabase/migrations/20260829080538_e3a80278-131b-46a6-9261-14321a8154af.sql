CREATE OR REPLACE FUNCTION public.generate_voucher_ref_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_year TEXT;
  v_yearint INT;
  v_next INT;
  v_lock_key BIGINT;
  v_existing_ref TEXT;
  v_doc_type TEXT;
  v_num INT;
BEGIN
  v_prefix := CASE NEW.type
    WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PV'
    WHEN 'journal' THEN 'QV'
    ELSE 'V'
  END;
  v_year := to_char(COALESCE(NEW.date::timestamp with time zone, NEW.created_at, now()), 'YYYY');
  v_yearint := v_year::int;
  v_doc_type := COALESCE(NEW.type, 'voucher') || '_voucher';
  v_existing_ref := btrim(COALESCE(NEW.ref_number, ''));

  -- Manual / foreign-format references are always preserved as-is.
  IF v_existing_ref <> '' AND v_existing_ref !~ ('^' || v_prefix || '-\d{4}-\d+$') THEN
    NEW.ref_number := v_existing_ref;
    RETURN NEW;
  END IF;

  v_lock_key := ('x' || substr(md5(NEW.user_id::text || '|' || NEW.type), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Honour a number already reserved by the UI (allocate_document_number)
  -- as long as it is still free for this tenant + type.
  IF v_existing_ref <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vouchers
       WHERE user_id = NEW.user_id
         AND type = NEW.type
         AND ref_number = v_existing_ref
         AND id IS DISTINCT FROM NEW.id
    ) THEN
      v_num := NULLIF(regexp_replace(v_existing_ref, '^[A-Z]+-\d{4}-', ''), '')::int;
      IF v_num IS NOT NULL THEN
        INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
        VALUES (NEW.user_id, v_doc_type, v_yearint, v_num)
        ON CONFLICT (user_id, doc_type, year)
        DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number),
                      updated_at = now();
      END IF;
      NEW.ref_number := v_existing_ref;
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(ref_number, '^[A-Z]+-\d{4}-', ''), '')::int), 0) + 1
    INTO v_next
    FROM public.vouchers
   WHERE user_id = NEW.user_id
     AND type = NEW.type
     AND ref_number ~ ('^' || v_prefix || '-' || v_year || '-\d+$');

  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (NEW.user_id, v_doc_type, v_yearint, v_next)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = GREATEST(document_sequences.last_number + 1, EXCLUDED.last_number),
                updated_at = now()
  RETURNING last_number INTO v_next;

  NEW.ref_number := v_prefix || '-' || v_year || '-' || LPAD(v_next::text, 4, '0');
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
  v_yearint int;
  v_next int;
  v_lock_key bigint;
  v_existing_ref text;
  v_num int;
BEGIN
  v_year := to_char(COALESCE(NEW.payment_date, NEW.created_at::date, CURRENT_DATE), 'YYYY');
  v_yearint := v_year::int;
  v_existing_ref := btrim(COALESCE(NEW.receipt_number, ''));

  IF v_existing_ref <> '' AND v_existing_ref !~ '^REC-\d{4}-\d+$' THEN
    NEW.receipt_number := v_existing_ref;
    RETURN NEW;
  END IF;

  v_lock_key := ('x' || substr(md5(NEW.user_id::text || '|receipt_vouchers'), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_existing_ref <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.receipt_vouchers
       WHERE user_id = NEW.user_id
         AND receipt_number = v_existing_ref
         AND id IS DISTINCT FROM NEW.id
    ) THEN
      v_num := NULLIF(regexp_replace(v_existing_ref, '^REC-\d{4}-', ''), '')::int;
      IF v_num IS NOT NULL THEN
        INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
        VALUES (NEW.user_id, 'receipt_voucher', v_yearint, v_num)
        ON CONFLICT (user_id, doc_type, year)
        DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number),
                      updated_at = now();
      END IF;
      NEW.receipt_number := v_existing_ref;
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_number, '^REC-\d{4}-', ''), '')::int), 0) + 1
    INTO v_next
    FROM public.receipt_vouchers
   WHERE user_id = NEW.user_id
     AND receipt_number ~ ('^REC-' || v_year || '-\d+$');

  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (NEW.user_id, 'receipt_voucher', v_yearint, v_next)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = GREATEST(document_sequences.last_number + 1, EXCLUDED.last_number),
                updated_at = now()
  RETURNING last_number INTO v_next;

  NEW.receipt_number := 'REC-' || v_year || '-' || LPAD(v_next::text, 4, '0');
  RETURN NEW;
END;
$function$;