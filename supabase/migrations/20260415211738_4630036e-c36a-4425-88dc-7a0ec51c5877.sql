ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'product';

-- Add validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_product_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_type NOT IN ('product', 'service') THEN
    RAISE EXCEPTION 'product_type must be product or service';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_product_type
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.validate_product_type();