CREATE OR REPLACE FUNCTION public.generate_voucher_ref_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number != '' THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE NEW.type
    WHEN 'receipt' THEN 'REC'
    WHEN 'payment' THEN 'PAY'
    WHEN 'journal' THEN 'JV'
    ELSE 'VCH'
  END;

  v_year := EXTRACT(YEAR FROM NOW())::TEXT;

  SELECT COUNT(*) + 1 INTO v_count
  FROM public.vouchers
  WHERE user_id = NEW.user_id 
    AND type = NEW.type
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  NEW.ref_number := v_prefix || '-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;