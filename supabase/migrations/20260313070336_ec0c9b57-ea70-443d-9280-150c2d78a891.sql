
-- Fix invoice number generation: reset sequence per year
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_prefix TEXT;
  v_year TEXT;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number != '' THEN
    RETURN NEW;
  END IF;
  
  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    ELSE 'DOC'
  END;
  
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.invoices
  WHERE user_id = NEW.user_id 
    AND invoice_type = NEW.invoice_type
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.invoice_number := v_prefix || '-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

-- Fix voucher ref number: reset sequence per year
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
    WHEN 'receipt' THEN 'RV'
    WHEN 'payment' THEN 'PV'
    WHEN 'journal' THEN 'QV'
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

-- Fix purchase invoice number: reset per year
CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.purchase_invoices
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.invoice_number := 'PO-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

-- Fix import shipment number: reset per year
CREATE OR REPLACE FUNCTION public.generate_import_shipment_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.import_shipments
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.shipment_number := 'IMP-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;

-- Fix contract number: reset per year
CREATE OR REPLACE FUNCTION public.gen_contract_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.project_contracts
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.contract_number := 'CON-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;

-- Fix claim number: reset per year
CREATE OR REPLACE FUNCTION public.gen_claim_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.financial_claims
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  NEW.claim_number := 'CLM-' || v_year || '-' || LPAD(v_count::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;

-- Fix procurement request number: reset per year
CREATE OR REPLACE FUNCTION public.generate_procurement_request_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.procurement_requests
  WHERE owner_id = NEW.owner_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.request_number := 'PR-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;
