CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
  v_prefix text;
  v_year integer;
  v_offset integer := 0;
  v_max_existing integer := 0;
  v_candidate text;
BEGIN
  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV' WHEN 'sales' THEN 'INV' WHEN 'purchase' THEN 'PO'
    WHEN 'credit_note' THEN 'CN' WHEN 'debit_note' THEN 'DN'
    WHEN 'sales_return' THEN 'SR' WHEN 'purchase_return' THEN 'PR'
    ELSE 'DOC' END;

  IF NEW.invoice_type IN ('sale', 'sales', 'purchase') THEN
    SELECT CASE
      WHEN NEW.invoice_type IN ('sale', 'sales') THEN COALESCE(NULLIF(trim(invoice_prefix), ''), v_prefix)
      WHEN NEW.invoice_type = 'purchase' THEN COALESCE(NULLIF(trim(purchase_order_prefix), ''), v_prefix)
      ELSE v_prefix END
    INTO v_prefix FROM public.company_settings WHERE user_id = NEW.user_id LIMIT 1;
    v_prefix := COALESCE(NULLIF(trim(v_prefix), ''), CASE WHEN NEW.invoice_type = 'purchase' THEN 'PO' ELSE 'INV' END);
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.invoice_date, NEW.created_at::date, CURRENT_DATE))::integer;

  -- Fast path: counter row exists -> atomic increment (row lock serializes concurrent inserts)
  UPDATE public.invoice_sequences
     SET last_number = last_number + 1, updated_at = now()
   WHERE user_id = NEW.user_id AND invoice_type = NEW.invoice_type
     AND year = v_year AND prefix = v_prefix
  RETURNING last_number INTO v_next;

  IF v_next IS NULL THEN
    -- First use only: seed from offset / existing MAX, exactly as before
    IF NEW.invoice_type IN ('sale', 'sales') THEN
      SELECT COALESCE(invoice_number_offset, 0) INTO v_offset
      FROM public.companies WHERE owner_id = NEW.user_id LIMIT 1;
      v_offset := COALESCE(v_offset, 0);
    END IF;

    SELECT COALESCE(MAX(parts[3]::integer), 0) INTO v_max_existing
    FROM public.invoices i
    CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
    WHERE i.user_id = NEW.user_id AND i.invoice_type = NEW.invoice_type
      AND parts IS NOT NULL AND parts[1] = v_prefix AND parts[2] = v_year::text;

    INSERT INTO public.invoice_sequences (user_id, invoice_type, year, prefix, last_number, updated_at)
    VALUES (NEW.user_id, NEW.invoice_type, v_year, v_prefix, GREATEST(COALESCE(v_offset,0), COALESCE(v_max_existing,0)), now())
    ON CONFLICT (user_id, invoice_type, year, prefix) DO NOTHING;

    UPDATE public.invoice_sequences
       SET last_number = last_number + 1, updated_at = now()
     WHERE user_id = NEW.user_id AND invoice_type = NEW.invoice_type
       AND year = v_year AND prefix = v_prefix
    RETURNING last_number INTO v_next;
  END IF;

  v_candidate := v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');

  -- Safety guard (unique-index lookup): skip a number only if already occupied (e.g. manual start change)
  WHILE EXISTS (SELECT 1 FROM public.invoices
                WHERE user_id = NEW.user_id AND invoice_type = NEW.invoice_type
                  AND invoice_number = v_candidate) LOOP
    UPDATE public.invoice_sequences
       SET last_number = last_number + 1, updated_at = now()
     WHERE user_id = NEW.user_id AND invoice_type = NEW.invoice_type
       AND year = v_year AND prefix = v_prefix
    RETURNING last_number INTO v_next;
    v_candidate := v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
  END LOOP;

  NEW.invoice_number := v_candidate;
  RETURN NEW;
END;
$function$;