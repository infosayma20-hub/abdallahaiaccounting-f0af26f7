
CREATE OR REPLACE FUNCTION public.generate_delivery_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
BEGIN
  current_year := to_char(now(), 'YYYY');
  
  SELECT COALESCE(MAX(
    CAST(NULLIF(split_part(delivery_number, '-', 3), '') AS INT)
  ), 0) + 1
  INTO next_seq
  FROM delivery_notes
  WHERE delivery_number LIKE 'DN-' || current_year || '-%'
    AND user_id = NEW.user_id;

  NEW.delivery_number := 'DN-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_delivery_number
  BEFORE INSERT ON public.delivery_notes
  FOR EACH ROW
  WHEN (NEW.delivery_number IS NULL OR NEW.delivery_number = '')
  EXECUTE FUNCTION public.generate_delivery_number();
