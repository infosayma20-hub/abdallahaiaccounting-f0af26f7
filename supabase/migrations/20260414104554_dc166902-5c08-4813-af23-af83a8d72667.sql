
-- Add offset column to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS invoice_number_offset INTEGER NOT NULL DEFAULT 0;

-- Set offset for the specific user (1250 so first invoice = 1250 + 1 = 1251)
UPDATE public.companies SET invoice_number_offset = 1250 WHERE owner_id = '6e3d46e2-4b58-4e80-a71e-05661aa8adaf';

-- Update the generate_invoice_number function to use offset
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_prefix TEXT;
  v_year TEXT;
  v_offset INTEGER;
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
  
  -- Get user's offset
  SELECT COALESCE(invoice_number_offset, 0) INTO v_offset
  FROM public.companies
  WHERE owner_id = NEW.user_id;
  
  IF v_offset IS NULL THEN
    v_offset := 0;
  END IF;
  
  SELECT COUNT(*) + 1 + v_offset INTO v_count
  FROM public.invoices
  WHERE user_id = NEW.user_id 
    AND invoice_type = NEW.invoice_type
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  
  NEW.invoice_number := v_prefix || '-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;
