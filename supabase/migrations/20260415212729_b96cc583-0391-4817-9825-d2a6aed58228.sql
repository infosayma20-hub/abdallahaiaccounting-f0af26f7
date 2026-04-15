ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS service_direction text DEFAULT NULL;

-- Update validation trigger to include service_direction
CREATE OR REPLACE FUNCTION public.validate_product_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_type NOT IN ('product', 'service') THEN
    RAISE EXCEPTION 'product_type must be product or service';
  END IF;
  IF NEW.product_type = 'service' AND NEW.service_direction IS NOT NULL 
     AND NEW.service_direction NOT IN ('provided', 'received') THEN
    RAISE EXCEPTION 'service_direction must be provided or received';
  END IF;
  IF NEW.product_type = 'product' THEN
    NEW.service_direction := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;