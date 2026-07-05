CREATE OR REPLACE FUNCTION public.generate_voucher_ref_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_year TEXT;
  v_next INT;
  v_lock_key BIGINT;
  v_existing_ref TEXT;
BEGIN
  v_prefix := CASE NEW.type
    WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PV'
    WHEN 'journal' THEN 'QV'
    ELSE 'V'
  END;
  v_year := to_char(COALESCE(NEW.date::timestamp with time zone, NEW.created_at, now()), 'YYYY');
  v_existing_ref := btrim(COALESCE(NEW.ref_number, ''));

  -- Preserve explicit/manual references, but never trust UI-generated voucher
  -- references that match the same automatic pattern. Those must be allocated
  -- here under the advisory transaction lock to prevent duplicate numbers.
  IF v_existing_ref <> ''
     AND v_existing_ref !~ ('^' || v_prefix || '-\d{4}-\d+$') THEN
    NEW.ref_number := v_existing_ref;
    RETURN NEW;
  END IF;

  -- Serialize concurrent inserts for the same tenant + voucher type.
  v_lock_key := ('x' || substr(md5(NEW.user_id::text || '|' || NEW.type), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(NULLIF(regexp_replace(ref_number, '^[A-Z]+-\d{4}-', ''), '')::int), 0) + 1
    INTO v_next
    FROM public.vouchers
   WHERE user_id = NEW.user_id
     AND type = NEW.type
     AND ref_number ~ ('^' || v_prefix || '-' || v_year || '-\d+$');

  NEW.ref_number := v_prefix || '-' || v_year || '-' || LPAD(v_next::text, 4, '0');
  RETURN NEW;
END;
$function$;