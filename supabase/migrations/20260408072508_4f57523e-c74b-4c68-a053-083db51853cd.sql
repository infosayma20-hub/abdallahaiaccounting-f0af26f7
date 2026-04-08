
CREATE OR REPLACE FUNCTION public.fn_invoice_tax_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tax_type text;
  v_period_year int;
  v_period_month int;
  v_contact record;
  v_settings record;
  v_tax_rate numeric;
BEGIN
  -- If cancelled or draft, remove any existing tax ledger entries and return
  IF NEW.status IN ('cancelled', 'draft') THEN
    DELETE FROM tax_ledger WHERE reference_id = NEW.id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Only process if tax_amount > 0
  IF COALESCE(NEW.tax_amount, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Determine tax type
  IF NEW.invoice_type = 'sale' THEN
    v_tax_type := 'output';
  ELSE
    v_tax_type := 'input';
  END IF;

  v_period_year := EXTRACT(YEAR FROM NEW.invoice_date::date);
  v_period_month := EXTRACT(MONTH FROM NEW.invoice_date::date);

  SELECT tax_rate INTO v_tax_rate FROM tax_settings WHERE user_id = NEW.user_id LIMIT 1;
  IF v_tax_rate IS NULL THEN v_tax_rate := 16; END IF;

  SELECT tax_number INTO v_contact FROM contacts WHERE id = NEW.contact_id AND user_id = NEW.user_id LIMIT 1;

  -- Remove old entries for this invoice (in case of update)
  DELETE FROM tax_ledger WHERE reference_id = NEW.id AND user_id = NEW.user_id;

  -- Insert tax ledger entry
  INSERT INTO tax_ledger (
    user_id, period_year, period_month, transaction_date,
    reference_type, reference_id, tax_type, tax_category,
    net_amount, tax_rate, tax_amount,
    invoice_number, party_name, party_tax_number,
    is_deductible
  ) VALUES (
    NEW.user_id, v_period_year, v_period_month, NEW.invoice_date::date,
    CASE WHEN NEW.invoice_type = 'sale' THEN 'sale_invoice' ELSE 'purchase_invoice' END,
    NEW.id,
    v_tax_type,
    'standard',
    COALESCE(NEW.subtotal, 0) - COALESCE(NEW.discount_amount, 0),
    v_tax_rate,
    NEW.tax_amount,
    NEW.invoice_number,
    NEW.contact_name,
    v_contact.tax_number,
    CASE WHEN v_tax_type = 'input' THEN true ELSE false END
  );

  RETURN NEW;
END;
$function$;
